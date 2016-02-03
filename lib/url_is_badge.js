/// file: identify if a url is a badge

const request = require('superagent');
const mime = require('mime');
const svg2png = require('svg2png');

const is_badge = require('./is_badge');

// cb(err, is_badge)
module.exports = function(url, cb) {
    request
    .get(url)
    .set('badginator-request', 'sup dog')
    .end((err, res) => {
        if (err) {
            return cb(err);
        }

        if (res.status !== 200) {
            return cb(null, false);
        }

        var type = res.headers['content-type'];
        var ext = mime.extension(type);

        // only support png and svg badges for now
        if (ext !== 'svg' && ext !== 'png') {
            return cb(null, false);
        }

        if (ext === 'svg') {
            // convert to png first
            svg2png(res.body)
            .then((buffer) => {
                is_badge(buffer, (err, badge) => {
                    cb(err, badge);
                });
            })
            .catch((err) => {
                cb(err);
            });

            return;
        }

        is_badge(res.body, (err, badge) => {
            cb(err, badge);
        });
    });
};
