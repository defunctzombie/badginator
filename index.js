const express = require('express');
const async = require('async');
const request = require('superagent');
const printf = require('printf');
const https = require('https');
const marked = require('marked');
const cheerio = require('cheerio');
const redis = require('redis');
const crypto = require('crypto');

const url_is_badge = require('./lib/url_is_badge');

var redisCache = redis.createClient(process.env.REDIS_URL);
redisCache.on('error', function (err) {
    console.error('Redis error:', err);
});

var app = express();

app.set('x-powered-by', false);

app.get('/', function(req, res, next) {
    res.redirect('https://github.com/defunctzombie/badginator');
});

app.get('/:org/:repo.svg', function(req, res, next) {
    var org = req.params.org;
    var repo = req.params.repo;

    // if badginator request, serve up dummy badge
    if (req.headers['badginator-request'] === 'sup dog') {
        var url = printf('https://img.shields.io/badge/badges-dummy-green.svg');
        https.get(url, function(img_res) {
            res.set({
                'content-type': img_res.headers['content-type'],
                'cache-control': 'no-cache, no-store, must-revalidate',
            });
            img_res.pipe(res);
        });
        return;
    }

    var count_fn = regex_count_readme_badges;

    if (req.query.image_analysis) {
        count_fn = count_readme_badges;
    }

    count_fn({
        org: org,
        repo: repo,
    }, function(err, badge_count) {
        if (err) {
            return next(err);
        }

        var color = 'red';

        if (badge_count <= 2) {
            color = 'red';
        }
        else if (badge_count <= 4) {
            color = 'orange';
        }
        else if (badge_count <= 6) {
            color = 'green';
        }
        else {
            color = 'brightgreen';
        }

        var etag = badge_count + color;
        var url = printf('https://img.shields.io/badge/badges-%d-%s.svg', badge_count, color);
        if (process.env.USE_REDIRECT_URL === '1') {
            return res.redirect(url);
        }

        https.get(url, function(img_res) {
            res.set({
                'content-type': img_res.headers['content-type'],
                'cache-control': 'no-cache, no-store, must-revalidate',
                'etag': etag,
            });
            img_res.pipe(res);
        });
    });
});

function regex_count_readme_badges(opt, cb) {
    fetch_readme(opt, function(err, readme) {
        if (err) {
            return cb(err);
        }

        // remove markdown sections
        readme = readme.replace(/```[^]*?```/g, '');

        // count instances of [![](.svg or .png)]
        // followed by () which is a link
        var regexp = /(\[[!]\[.*\]\(.*(\.svg|\.png).*\)\]\(.*\)|[!]\[.*\]\(.*(\.svg|\.png).*\))/g;
        var count = 0;
        while(regexp.exec(readme) !== null) {
            count++;
        }

        cb(null, count);
    });
};

function count_readme_badges(opt, cb) {
    fetch_readme(opt, function(err, readme) {
        if (err) {
            return cb(err);
        }

        // process readme
        var html = marked(readme);
        var $ = cheerio.load(html);

        var urls = $('img').map(function(idx, img) {
            return $(img).attr('src');
        }).get();

        var count = 0;
        async.each(urls, function(url, done) {
            //async.reduce(urls, 0, function(count, url, done) {
            // this is gnarly and could be a function now
            var hash = crypto.createHash('md5').update(url).digest('hex');
            var url_key = 'url-cache:' + hash;
            redisCache.get(url_key, function(err, val) {
                if (err) {
                    console.error(err);
                    return done();
                }

                // have cached value
                if (val !== null) {
                    count += (val === 'true' ? 1 : 0);
                    // redis values are strings, yay
                    //return done(null, count + (val === 'true' ? 1 : 0));
                    return done();
                }

                url_is_badge(url, function(err, is_badge) {
                    if (err) {
                        console.error(err);
                    }
                    else {
                        redisCache.setex(url_key, 60 * 15, is_badge, function(err) {
                            if (err) {
                                console.error(err);
                            }
                        });
                    }

                    count += (is_badge ? 1 : 0);
                    done();
                    //done(null, count + (is_badge ? 1 : 0));
                });

            });
        }, function(err) {
            cb(err, count);
        });
    });
}

function fetch_readme(opt, cb) {
    var org = opt.org;
    var repo = opt.repo;

    var base_url = printf('https://raw.githubusercontent.com/%s/%s/master/', org, repo);
    var readme_variants = ['README.md', 'readme.md', 'Readme.md', 'README.MD', 'readme.markdown'];
    var readme_text = '';

    async.some(readme_variants, function(name, cb) {
        var url = base_url + name;
        request.get(url).end(function(err, res) {
            if (err) {
                return cb(false);
            }

            if (res.status !== 200) {
                return cb(false);
            }

            readme_text = res.text;
            cb(true);
        });
    }, function(found) {
        cb(null, readme_text);
    });
}


app.listen(process.env.PORT || 3000);
