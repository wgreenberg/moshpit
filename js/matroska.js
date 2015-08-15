// via http://www.matroska.org/technical/specs/index.html
const CLUSTER = '1f43b675';
const SIMPLE_BLOCK = 'a3';

// returns the value and length of the variable-sized int at a given offset
function getVintAt (buffer, cursor) {
    if (cursor > buffer.byteLength)
        throw new Error('NO DICE');
    var length = 1;
    var mask = 1 << 7;
    while (!(buffer[cursor] & mask)) {
        if (length > 7)
            throw new Error('Invalid length: ' + buffer[cursor]);
        length++;
        mask >>= 1;
    }
    var value = buffer[cursor] & ((1 << (8 - length)) - 1);
    for (var i=1; i < length; i++) {
        value <<= 8;
        value += buffer[cursor + i];
    }
    return {
        length: length,
        value: value,
    };
}

function writeVintAt (buffer, cursor, value) {
    for (var length = 1; length <= 8; length++) {
        if (value < Math.pow(2, 7 * length)) {
            break;
        }
    }
    var newBuffer = new Uint8Array(length);
    for (var i=1; i <= length; i++) {
        newBuffer[length - i] = value & 0xFF;
        value -= newBuffer[length - i];
        value >>= 8;
    }
    newBuffer[0] |= (1 << (8 - length));
    return insertBuffer(buffer, cursor, newBuffer);
}

function arrayBufferToString (buffer, base, begin, end) {
    var str = '';
    for (var i = begin; i < end; i++) {
        var value = buffer[i];
        if (value <= 0xF && i != begin)
            str += '0';
        str += value.toString(base);
    }
    return str;
}

// returns information about the tag at a given offset
function getTagAt (buffer, cursor) {
    var id = getVintAt(buffer, cursor);
    var idHex = arrayBufferToString(buffer, 16, cursor, cursor + id.length);
    var size = getVintAt(buffer, cursor + id.length);
    var dataStart = cursor + id.length + size.length;
    var dataEnd = dataStart + size.value;
    return {
        id: id.value,
        idHex: idHex,
        size: size.value,
        sizeLength: size.length,
        updateSize: function (otherBuffer, newSize) {
            // remove existing size data
            var finalBuffer = removeBuffer(otherBuffer, cursor + id.length, size.length);
            // insert updated size vint
            finalBuffer = writeVintAt(finalBuffer, cursor + id.length, newSize);
            return finalBuffer;
        },
        tagStart: cursor,
        start: dataStart,
        end: dataEnd,
        data: buffer.subarray(dataStart, dataEnd),
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

function removeBuffer (buffer, cursor, size) {
    var left = buffer.subarray(0, cursor);
    var right = buffer.subarray(cursor + size);
    var ret = new Uint8Array(left.byteLength + right.byteLength);
    ret.set(left);
    ret.set(right, left.byteLength);
    return ret;
}

function insertBuffer (buffer, cursor, insert) {
    var left = buffer.subarray(0, cursor);
    var right = buffer.subarray(cursor);
    var ret = new Uint8Array(left.byteLength + right.byteLength + insert.byteLength);
    ret.set(left);
    ret.set(insert, left.byteLength);
    ret.set(right, left.byteLength + insert.byteLength);
    return ret;
}

// slice out block
function removeBlock (buffer, block) {
    return removeBuffer(buffer, block.tagStart, block.end - block.tagStart);
}

// replace destBlock with srcBlock
function replaceBlock (buffer, newBlock, oldBlock) {
    var oldBlockSize = oldBlock.end - oldBlock.tagStart;
    return insertBuffer(removeBuffer(buffer, oldBlock.tagStart, oldBlockSize), oldBlock.tagStart, newBlock);
}
