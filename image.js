'use strict';

const async = require('async');
const AWS = require('aws-sdk');
const sharp = require('sharp');
const util = require('util');
const SOURCE_BUCKET = 'hackathon-img';
const BUCKET_URL = 'http://hackathon-img.s3-website-us-east-1.amazonaws.com/';
const fileDimRegex = /^([a-z]+)(\d+)x(\d+)(\.[a-z]+)/i;
const fileNameRegex = /\.([^.]*)$/;
const allowedFilesRegex = /^(jpg|png|gif|webp)$/;

// get reference to S3 client
var s3 = new AWS.S3();

var mimeTypes = {
    "jpg": "jpeg",
    "jpe": "jpeg",
    "jpeg": "jpeg",
    "png": "png",
    "gif": "gif"
};


exports.handler = function (event, context) {
    console.log('Received event', event);
    var name = decodeURIComponent(event.name);
    var fileDimParts = name.match(fileDimRegex);
    var w, h, fileName, key, typeMatch, imageType, format;

    if (!fileDimParts) {
        context.fail(new Error('Dimension not found'));
        return;
    }
    w = parseInt(fileDimParts[2]);
    h = parseInt(fileDimParts[3]);
    fileName = fileDimParts[1] + fileDimParts[4];
    typeMatch = fileName.match(fileNameRegex);

    if (!typeMatch) {
        context.fail(new Error('unable to infer image type for key ' + fileName));
        return;
    }

    imageType = typeMatch[1];
    if (!allowedFilesRegex.test(imageType)) {
        context.fail(new Error('unsupported file ' + fileName));
        return;
    }

    format = mimeTypes[imageType];
    if (!format) {
        context.fail(new Error('missing mime type mapping for extension ' + imageType));
        return;
    }

    if (w <= 0 || h <= 0) {
        context.fail(new Error('Invalid image size. width=' + w + '. height=' + h));
        return;
    }

    async.waterfall([
            function download(next) {
                // Download the image from S3 into a buffer.
                s3.getObject({
                        Bucket: SOURCE_BUCKET,
                        Key: fileName
                    },
                    next);
            },
            function transform(response, next) {
                sharp(response.Body)
                    .resize(w, h).max()
                    .toFormat(format)
                    .toBuffer(next);
            },
            function upload(data, info, next) {
                var contentType = 'image/' + format;
                // Stream the transformed image to a different S3 bucket.
                s3.putObject({
                        Bucket: SOURCE_BUCKET,
                        Key: name,
                        Body: data,
                        ContentType: contentType
                    },
                    next);
            }
        ], function (err, result) {
            // Stripped some logging here...
            context.done(null, {location: BUCKET_URL + name});

        }
    );
};
