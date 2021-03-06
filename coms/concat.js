var pngjs = require("pngjs");
var fs = require("fs");
var path = require("path");
var { PNG } = pngjs;

var getExtentionsFromPath = function (destpath) {
    var exts;
    if (/\.([\|]?(json|png|html|css))+$/i.test(destpath)) {
        if (!exts) exts = {};
        destpath.replace(/[\s\S]*\.([^\.]*)$/, "$1").split("|").forEach(function (a) {
            switch (a) {
                case "html":
                    exts.html = true;
                case "css":
                    exts.css = true;
                    break;
                case "json":
                    exts.json = true;
                    break;
            }
        });
        exts.png = true;
        destpath = destpath.replace(/([\s\S]*)\.[^\.]*$/, "$1") || void 0;
    }
    return [destpath, exts];
}
var concatpng = function (pathname, destpath, pixel = "1px") {
    if (pixel && /^(\d+)?(\.\d+)?$/.test(pixel)) pixel = 1 / pixel + "px";
    var pixel_scale = /^(\d+(?:\.\d*)?|\.\d+)(.*?)$/.exec(pixel);
    if (!pixel_scale) throw new Error("pixel参数无效，可以传入的值有1px,2px,1em,2em等数字加单位的形式");
    fs.readdir(pathname, function (err, files) {
        var pngcollection = [];
        if (err) {
            console.error(err);
            return;
        }
        files.filter(name => /\.png$/i.test(name) && !/\.concat\.png$/i.test(name))
            .map(function (filename, cx, filtered) {
                var fullpath = path.join(pathname, filename);
                readinfo(fullpath).then(function (pngObject) {
                    pngObject.name = filename.replace(/\.png$/i, "");
                    pngObject.cssname = pngObject.name.replace(/[^\w\-\_]/g, a => a.charCodeAt(0).toString(36));
                    pngcollection.push(pngObject);
                    if (pngcollection.length === filtered.length) {
                        packcollection(pngcollection, destpath, +pixel_scale[1] || 1, pixel_scale[2] || "px");
                    }
                });
            });

    })
};
var readinfo = function (pngsrc) {
    return new Promise(function (ok, oh) {
        fs.createReadStream(pngsrc).pipe(new PNG).on('parsed', function () { ok(this) });
    });
};

var packcollection = function (pngcollection, filedestpath, ratio, pixel) {
    var sizeMap = {
    };
    var totalSize = 0;
    pngcollection.forEach(function (png) {
        var sizekey = [png.width, png.height].join(",");
        totalSize += png.width * png.height;
        if (!sizeMap[sizekey]) sizeMap[sizekey] = 1;
        else sizeMap[sizekey]++;
    });
    var aimedWidth = Math.sqrt(totalSize), targetWidth = 0;
    for (var k in sizeMap) {
        var tempWidth = +k.split(",")[0];
        var tempCount = +(aimedWidth / tempWidth).toFixed(0);
        if (tempCount) {
            if (tempCount < 1) tempCount = 1;
            targetWidth = Math.max(tempCount * tempWidth, targetWidth);
        }
    }
    var offsetMap = {
    };
    var totalHeight = 0;
    for (var k in sizeMap) {
        var [tempWidth, tempHeight] = k.split(",");
        var tempCount = +(targetWidth / tempWidth);
        var tempHeight = Math.ceil(sizeMap[k] / tempCount) * tempHeight;
        offsetMap[k] = [0, totalHeight];
        if (tempHeight) {
            totalHeight += tempHeight;
        }
    }
    pngcollection.forEach(function (png) {
        var { width, height } = png;
        var sizekey = [width, height].join(",");
        var [offsetLeft, offsetTop] = offsetMap[sizekey];
        png.left = offsetLeft;
        png.top = offsetTop;
        offsetLeft += width;
        if (offsetLeft + width > targetWidth) {
            offsetLeft = 0;
            offsetTop += height;
        }
        offsetMap[sizekey] = [offsetLeft, offsetTop];
    });
    var dest = new PNG({
        width: targetWidth,
        height: totalHeight
    });
    var [maxWidthLength, maxHeightLength, maxNameLength, maxLeftLength, maxTopLength] = [0, 0, 0, 0, 0];
    var scale = function (str) {
        if (typeof str === "string") return str;
        return +(ratio * str).toFixed(4) + pixel;
    };
    pngcollection.forEach(function (png) {
        var { width, height, top, left, cssname } = png;
        maxNameLength = Math.max(scale(cssname).length, maxNameLength);
        maxWidthLength = Math.max(scale(width).length, maxWidthLength);
        maxHeightLength = Math.max(scale(height).length, maxHeightLength);
        maxLeftLength = Math.max(scale(-left).length, maxLeftLength);
        maxTopLength = Math.max(scale(-top).length, maxTopLength);
        png.bitblt(dest, 0, 0, width, height, left, top);
    });
    var [filedestname = "png-concat.concat", extentions = { png: true, html: true, css: true, json: true }] = getExtentionsFromPath(filedestpath);
    var pngfilename = filedestname + ".png";
    var cssfilename = filedestname + ".css";
    var padding = function (str, minLength) {
        if (typeof str !== "string") var isReverse = true;;
        str = scale(str);
        if (str.length >= minLength) return str;
        if (isReverse) return " ".repeat(minLength - str.length) + str;
        return str + " ".repeat(minLength - str.length);
    };
    var stylesheets = pngcollection.map(function (png) {
        return `.png-concat-${padding(png.cssname, maxNameLength)} { width: ${padding(png.width, maxWidthLength)}; height: ${padding(png.height, maxHeightLength)}; background-position: ${padding(-png.left, maxLeftLength)} ${padding(-png.top, maxTopLength)} }`
    });
    var cssdata = [
        `.png-concat{ background: url('${pngfilename}') no-repeat 0 0 / ${scale(targetWidth)} ${scale(totalHeight)}; display: inline-block; }`
    ].concat(stylesheets).join("\r\n");
    var divdata = pngcollection.map(function (png) {
        return `<div class="png-concat png-concat-${png.cssname}"></div>`
    }).join("\r\n");
    var htmldata = `<!doctype html>\r\n<html><head><meta charset="utf-8"/><title>png-concat图标查看工具</title><link rel="stylesheet" type='text/css' href="${cssfilename}"/></head>\r\n<body>\r\n${divdata}\r\n</body></html>`
    dest.pack().pipe(fs.createWriteStream(pngfilename));
    var jsondata = {};
    pngcollection.forEach(function ({ cssname, width, height, left, top }) {
        return jsondata[cssname] = { pixelRatio: ratio, width, height, x: left, y: top };
    });
    [
        ["css", cssdata, cssfilename],
        ['html', htmldata],
        ['json', JSON.stringify(jsondata, null, 4)]
    ].forEach(function ([ext, data, filename = filedestname + '.' + ext]) {
        if (extentions[ext]) {
            fs.writeFile(filename, data, function (error) {
                if (error) return console.error(
                    new Error(`写入${ext}失败！`)
                );
                console.log(filename);
            });
        }

    });
};
var concat = module.exports = concatpng;