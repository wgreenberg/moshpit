var fs = require('fs');

// via http://www.matroska.org/technical/specs/index.html
const CLUSTER = '1f43b675';
const SIMPLE_BLOCK = 'a3';

// returns the value and length of the variable-sized int at a given offset
function getVintAt (buffer, cursor) {
    if (cursor > buffer.length)
        throw new Error('NO DICE');
    var length = 1;
    var mask = 1 << 7;
    while (!(buffer[cursor] & mask)) {
        length++;
        mask >>= 1;
    }
    var value = buffer[cursor] & ((1 << (8 - length)) - 1);
    for (var i=1; i < length; i++) {
        value *= Math.pow(2, 8);
        value += buffer[cursor + i];
    }
    return {
        length: length,
        value: value,
    };
}

// returns information about the tag at a given offset
function getTagAt (buffer, cursor) {
    var id = getVintAt(buffer, cursor);
    var idHex = buffer.toString('hex', cursor, cursor + id.length);
    var size = getVintAt(buffer, cursor + id.length);
    var dataStart = cursor + id.length + size.length;
    var dataEnd = dataStart + size.value;
    return {
        id: id.value,
        idHex: idHex,
        size: size.value,
        tagStart: cursor,
        start: dataStart,
        end: dataEnd,
        data: buffer.slice(dataStart, dataEnd),
    };
}

// returns a list of SimpleBlock tag info at a cluster
function getBlocks (buffer, cluster) {
    var blocks = [];
    var cursor = cluster.start;

    while (cursor - cluster.start < cluster.size) {
        var block = getTagAt(buffer, cursor);
        if (block.idHex === SIMPLE_BLOCK) {
            blocks.push(block);
        }
        cursor = block.end;
    }
    if (cursor !== block.end)
        console.error('Expected to end on byte %d, but got %d', block.end, cursor);

    return blocks;
}

// slice out block
function removeBlock (buffer, block) {
    var left = buffer.slice(0, block.tagStart);
    var right = buffer.slice(block.end, buffer.length);
    return Buffer.concat([left, right]);
}

// replace destBlock with srcBlock
function replaceBlock (buffer, srcBlock, destBlock) {
    var left = buffer.slice(0, destBlock.tagStart);
    var middle = buffer.slice(srcBlock.tagStart, srcBlock.end);
    var right = buffer.slice(destBlock.end, srcBlock.length);
    return Buffer.concat([left, middle, right]);
}

fs.readFile('data/bunny.webm', function(err, data) {
    // all EBML files begin with a header
    var header = getTagAt(data, 0);

    // ... then comes the Segment
    var segment = getTagAt(data, header.end);

    // we're only interested in the Cluster child of Segment
    var segmentChild = getTagAt(data, segment.start);
    while (segmentChild.idHex != CLUSTER)
        segmentChild = getTagAt(data, segmentChild.end);
    var cluster = segmentChild;

    // extract all SimpleBlocks from the Cluster
    var blocks = getBlocks(data, cluster);

    // keyframes have the first bit set of their third byte (see SimpleBlock
    // format)
    var keyframes = blocks.filter(function (block) {
        return block.data[2] & 0x1;
    });

    // remove every 100th keyframe for ultimate moshing
    var finalData = data;
    keyframes.forEach(function (keyframe, i) {
        if (i % 100 === 0) {
            finalData = removeBlock(finalData, keyframe);
        }
    });

    // write out the moshed file
    fs.writeFile('data/bunny-moshed.webm', finalData, function (err) {
        console.log(err, 'nice');
    })
});
