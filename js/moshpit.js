function mosh (data) {
    // all EBML files begin with a header
    var header = getTagAt(data, 0);

    // ... then comes the Segment
    var segment = getTagAt(data, header.end);

    // we're only interested in the Cluster child of Segment
    var segmentChild = getTagAt(data, segment.start);
    while (segmentChild.idHex != CLUSTER) {
        segmentChild = getTagAt(data, segmentChild.end);
    }
    var cluster = segmentChild;

    // extract all SimpleBlocks from the Cluster
    var blocks = getBlocks(data, cluster);

    // do the mosh
    var finalData = data;
    var replacementBlockData;
    var p2b = []; // map pframe idx to its block idx
    var pFrames = blocks.filter(function (b, i) { // vp8 keyframes have leading 0
        if (b.data[0] & 1) {
            p2b.push(i);
            return true;
        }
    });
    var pFrames2Mosh = { // map pframe idx to target moshblock
        403: 330, // a beautiful home
        539: 360, // a beautiful home 2
        624: 390, // a beautiful home 3
        401: 780, // rodents
        330: 0, // the attack
        379: 0, // the laugh
        502: 0, // the march
        530: 0, // the face
        549: 0, // the crush
        625: 0, // the horror
        671: 0, // the end
    };
    var blocks2Mosh = {}; // maps target block idx to its new block data
    for (var pFrame in pFrames2Mosh) {
        var blockIdx2Mosh = p2b[pFrame];
        var block2Mosh = blocks[blockIdx2Mosh];
        var pFrameData = data.subarray(block2Mosh.tagStart, block2Mosh.end);

        // use target block if specified, else start at the pframe's idx
        blocks2Mosh[pFrames2Mosh[pFrame] || blockIdx2Mosh] = pFrameData;
    }
    var moshRuntime = 30; // how many frames a pframe should be copied for

    var moshTimer = 0;
    var moshBlock = null;
    for (var i = (blocks.length - 1); i > 0; i--) {
        var block = blocks[i];
        var isKeyFrame = !(block.data[0] & 1);

        // look ahead to see if a target block is coming up
        var lookaheadIdx = i - moshRuntime;
        if (lookaheadIdx in blocks2Mosh) {
            moshTimer = moshRuntime;
            moshBlock = blocks2Mosh[lookaheadIdx];
        }

        if (moshTimer > 0) {
            if (isKeyFrame)
                finalData = replaceBlock(finalData, moshBlock, block);
            moshTimer--; // we time based on real framecount, not keyframes
        }
    }
    // (it was the monster mosh)

    // recalculate EBML section sizes for SimpleBlock parents
    var removedData = data.byteLength - finalData.byteLength;
    finalData = cluster.updateSize(finalData, cluster.size - removedData);

    // since the Cluster size changed, its binary length might've changed too
    var oldSizeLength = cluster.sizeLength;
    var newSizeLength = getTagAt(finalData, cluster.tagStart).sizeLength;
    removedData += (oldSizeLength - newSizeLength);

    finalData = segment.updateSize(finalData, segment.size - removedData);

    return finalData;
}

function loadVideo (url, callback) {
    var request = new XMLHttpRequest();
    request.open("GET", url, true);
    request.responseType = "arraybuffer";

    request.onload = function() {
        callback(undefined, request.response);
    };

    request.onerror = function() {
        callback(new Error('you dun goofed'));
    };

    request.send();
}
