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
    for (var i = (blocks.length - 1); i > 0; i--) {
        var block = blocks[i];
        // keyframes have the first bit set of their third byte (see
        // SimpleBlock format)
        if (block.data[2] & 1) {
            if (replacementBlockData)
                finalData = replaceBlock(finalData, replacementBlockData, block);
        } else {
            replacementBlockData = data.subarray(block.tagStart, block.end);
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
    console.log(oldSizeLength, newSizeLength, removedData);

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
