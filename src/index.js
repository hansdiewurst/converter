const { Buffer } = require("buffer");
const JSZip = require("jszip");
const { parseBloxdschem, writeBloxdschem } = require("./bloxd.js");
const { parseSchem, parseLitematic, parseSchematic, writeMinecraft } = require("./minecraft.js");
const { mcJSONToBloxd, bloxdJSONtoMc } = require("./json.js");

const downloadBin = function(data, name) {
    const blob = new Blob([data], {
        type: "application/octet-stream"
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = name;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
};
const downloadZip = async function(zip, name) {
    const content = await zip.generateAsync({ type: "blob" });
    const url = URL.createObjectURL(content);
    const a = document.createElement("a");
    a.href = url;
    a.download = name;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
};
const error = function (text) {
    const err = new Error(text);
    const elem = document.createElement("div");
    elem.innerHTML = err;
    elem.style.color = "#f00";
    document.body.appendChild(elem);
    setTimeout(() => elem.remove(), 5000);
    throw err;
};

const input = document.createElement("input");
input.type = "file";
input.accept = ".bloxdschem,.schematic,.schem,.litematic";
input.addEventListener("input", () => {
    const file = input.files[0];
    const split = file.name.split(".");
    const name = split[0];
    const type = split[split.length - 1];

    const fileReader = new FileReader();

    let handler;
    if(type === "bloxdschem") {
        handler = bloxdToMc;
     } else if(["schematic", "schem", "litematic"].includes(type)) {
        handler = mcToBloxd;
     } else {
        error("File type not recognized. Only valid are .bloxdschem, .schematic, .schem and .litematic");
     }

    fileReader.readAsArrayBuffer(file);
    fileReader.addEventListener("load", event => {
        const data = Buffer.from(event.target.result);
        handler(data, name, type);
    });
});
document.body.appendChild(input);

const bloxdToMc = function (buffer, name) {
    const startTime = Date.now();

    const parsed = parseBloxdschem(buffer);
    const mcJson = bloxdJSONtoMc(parsed);
    const mcSchem = writeMinecraft(mcJson);
    console.log(`Conversion time: ${Date.now() - startTime}`);

    downloadBin(mcSchem, `${name}.schem`);
};

const parseMc = async function(buffer) {
    try {
        return await parseSchem(buffer);
    } catch {}
    try {
        return await parseLitematic(buffer);
    } catch {}
    try {
        return await parseSchematic(buffer);
    } catch {}
};
const mcToBloxd = async function (buffer, name, type) {
    const startTime = Date.now();

    const parsed = await parseMc(buffer);
    const bloxdJson = mcJSONToBloxd(parsed, name);
    const {
        schems: bloxdSchems,
        sliceSize
    } = writeBloxdschem(bloxdJson);
    console.log(`Conversion time: ${Date.now() - startTime}`);

    if(bloxdSchems.length > 1) {
        const zip = new JSZip();
        for(let i = 0; i < bloxdSchems.length; i++) {
            const bloxdSchem = bloxdSchems[i];
            zip.file(`${name}-x${i * sliceSize}.bloxdschem`, bloxdSchem, { binary: true });
        }
        await downloadZip(zip, `${name}.zip`);
    } else {
        downloadBin(bloxdSchems[0], `${name}.bloxdschem`);
    }
};