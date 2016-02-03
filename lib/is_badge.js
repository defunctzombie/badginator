const gm = require('gm');
const printf = require('printf');

// we resize the image to this size for our analysis algos
const WIDTH = 50;
const HEIGHT = 15;

function is_badge(buff, cb) {
    gm(buff, 'image.png')
    .trim()
    .size(function(err, size) {
        if (err) {
            return cb(err);
        }

        if (size.height > 40) {
            return cb(null, false);
        }

        if (size.width < 40) {
            return cb(null, false);
        }

        this
        // order matters otherwise bitdepth doesn't behave how we want
        .resize(WIDTH, HEIGHT, '!')
        .bitdepth(3)
        .toBuffer('GRAY', function(err, img) {
            if (err) {
                return cb(err, false);
                }

            const is_badge = buffer_is_badge(new Uint8Array(img));
            cb(null, is_badge);
        });
    });
}

function buffer_is_badge(img) {
    // get a histogram of image values
    // key: count
    var hist = histogram_val(img);

    // turn the histogram of key: count -> array of { count: X, value: Y }
    var arr = [];
    Object.keys(hist).forEach(function(key) {
        arr.push({
            count: hist[key],
            value: key,
        });
    });

    // sort so we get most frequent first
    arr.sort(function(a, b) {
        return b.count - a.count;
    });
    //console.log(arr);

    const pixels = img.length;
    var primary_colors = 0;
    arr.reduce(function(prev, curr) {
        if (prev/pixels < 0.60) {
            primary_colors += 1;
        }

        return prev + curr.count;
    }, 0);
    //console.log(primary_colors);

    /*
    for (var r=0 ; r<HEIGHT ; ++r) {
        for (var c=0 ; c<WIDTH ; ++c) {
            process.stdout.write(printf('%4d', img[WIDTH * r + c] + ' '));
        }
        process.stdout.write('\n');
    }
    */

    // badges will have at least 2 primary colors and no more than 5
    if (primary_colors > 5 || primary_colors < 2) {
        return false;
    }

    var primaries = new Set();
    arr.slice(0, primary_colors).map(function(val) {
        primaries.add(+val.value);
    });
    //console.log(primaries);

    var column = 0;
    var enough = 0;
    var best_score = 0;

    // algo
    // loop over columns (width)
    // for each column we need to see how many primary colors we found before and after
    for (var c=10 ; c<WIDTH ; ++c) {
        // new column means we expect 80% of representation
        enough += HEIGHT;

        var total = 0;
        var locations = {
            before: {},
            after: {},
        };

        // before or after column
        for (var c2 = 0 ; c2 < WIDTH ; ++c2 ) {
            var before = c2 < c;
            // loop over columns again and mark before or after

            // each column will need to loop over rows
            for (var r=0 ; r<HEIGHT ; ++r) {
                var col_value = img[WIDTH * r + c2];

                // is col_value in primaries?
                if (!primaries.has(col_value)) { // === undefined) {
                    continue;
                }

                if (before) {
                    locations.before[col_value] = locations.before[col_value] || 0;
                    locations.before[col_value] += 1;
                }
                else {
                    locations.after[col_value] = locations.after[col_value] || 0;
                    locations.after[col_value] += 1;
                }
                total += 1;
            }
        }
        //console.log(locations);

        // normalize count of each against total pixels of primary colors
        normalize(locations.after, total);
        normalize(locations.before, total);

        //console.log(locations);

        // score is the difference between primary with most pixels in region
        // and primary with least pixels in region
        var score = score_region(locations.before) + score_region(locations.after);

        //console.log(score, best_score, c);
        if (score > best_score) {
            best_score = score;
            column = c;
        }
    }

    //console.log(column);
    // midpoint will not be too far on either size
    // we expect at least a score of 0.5 (evenly matched primaries on either side)
    if (column < 10 || column > 40 || best_score < 0.5) {
        return false;
    }

    return true;
}

function normalize(obj, den) {
    // normalize count of each against total pixels of primary colors
    Object.keys(obj).forEach(function(key) {
        obj[key] = obj[key] / den;
    });
}

function score_region(region) {
    var score = 0;
    var vals = Object.keys(region).map(function(key) {
        return region[key];
    });

    vals.sort(function(a, b) {
        return b - a;
    });

    if (vals.length == 1) {
        score += vals[0];
    }
    else if (vals.length > 1) {
        score += vals[0] - vals[vals.length - 1];
    }

    return score;
}

// given an array of values
// return { 'val': count }
// where count is the number of occurrences of 'val'
function histogram_val(array) {
    var out = Object.create(null);

    array.forEach(function(val) {
        val = String(val);
        var prev = out[val] || 0;
        out[val] = prev + 1;
    });

    return out;
}

module.exports = is_badge;
