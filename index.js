const express = require("express");
const middleware = require("@line/bot-sdk").middleware;
const JSONParseError = require("@line/bot-sdk").JSONParseError;
const GoogleDrive = require("node-google-drive");
const SignatureValidationFailed =
  require("@line/bot-sdk").SignatureValidationFailed;
const Client = require("@line/bot-sdk").Client;
const FileType = require("file-type");
const fse = require("fs-extra");
const path = require("path");
require("dotenv").config();

const port = process.env.PORT || 3500;
const app = express();

const lineConfig = {
  channelAccessToken: process.env.channelAccessToken,
  channelSecret: process.env.channelSecret,
};

const client = new Client(lineConfig);

app.use(middleware(lineConfig));
app.use((err, req, res, next) => {
  if (err instanceof SignatureValidationFailed) {
    res.status(401).send(err.signature);
    return;
  } else if (err instanceof JSONParseError) {
    res.status(400).send(err.raw);
    return;
  }
  next(err); // will throw default 500
});

app.post("/webhook", async (req, res) => {
  const event = req.body.events[0];
  // console.log(event);
  if (event) await loop(event);
  return res.json(req.body.events);
});

async function getFolder() {
  var dir = path.join(__dirname, "./.tmp");
  await fse.ensureDir(`${dir}`);
  return dir;
}

async function uploadFileDrive(file) {
  const googleDriveInstance = new GoogleDrive({
    ROOT_FOLDER: process.env.ROOT_FOLDER,
  });
  await googleDriveInstance.useServiceAccountAuth({
    client_email: process.env.client_email,
    private_key: process.env.private_key,
  });
  let uploadResponse = await googleDriveInstance.writeFile(file);
  return `https://drive.google.com/file/d/${uploadResponse.id}/view?usp=drivesdk`;
}

function createQRCode(url, size = 500) {
  return `https://chart.googleapis.com/chart?chs=${size}x${size}&cht=qr&chld=M|0&chl=${url}`;
}

async function getFile(id) {
  const instance = await client.getMessageContent(id);
  return instance;
}

async function loop(event) {
  var eventType = ["image", "file", "video", "audio"];
  if (eventType.includes(event.message.type)) {
    const response = await getFile(event.message.id);
    const data = [];
    response.on("data", (chunk) => {
      data.push(chunk);
    });
    response.on("error", (err) => {
      // error handling
    });
    response.on("end", (err) => {
      const _data = Buffer.concat(data);
      FileType.fromBuffer(_data).then(async (mime) => {
        // console.log(mime);
        var folder = await getFolder();
        const fileSource = `${folder}/${Math.random(8)}.${mime.ext}`;
        fse.writeFile(fileSource, _data, async (err) => {
          var url = await uploadFileDrive(fileSource);
          client.replyMessage(event.replyToken, {
            type: "text",
            text: `บันทึกเรียบร้อยแล้วครับ\n\n URL: ${url}  \n\n QRCode: ${createQRCode(
              url
            )}`,
          });
          fse.unlinkSync(fileSource);
        });
      });
    });
  }
}

app.listen(port, () => console.log(`http://localhost:${port}`));
