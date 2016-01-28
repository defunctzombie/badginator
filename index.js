var express = require('express');
var async = require('async');
var request = require('superagent');
var printf = require('printf');
var https = require('https');

var app = express();

app.set('x-powered-by', false);

app.get('/', function(req, res, next) {
    res.redirect('https://github.com/defunctzombie/badginator');
});

app.get('/:org/:repo.svg', function(req, res, next) {
    var org = req.params.org;
    var repo = req.params.repo;

    count_readme_badges({
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

function count_readme_badges(opt, cb) {
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
