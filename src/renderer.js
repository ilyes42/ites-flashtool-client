const $ = require("../node_modules/jquery/dist/jquery");
require("../node_modules/bootstrap/dist/js/bootstrap.bundle");

const fs = require("fs");
const path = require("path");
const request = require("request");
const onezip = require("onezip");
const glob = require("glob");
const { spawn } = require("child_process");
const progress = require("progress-stream");

const downloadsPath = path.resolve(__dirname, "../downloadedFirmwares");
const unzipPath = path.resolve(__dirname, "../extractedFirmwares");
const flasherPath = path.resolve(__dirname, "../flasher/flash_tool.exe");

const ONE_MEGA_BYTE = 1048576;
const phoneimgname = "ipro.jpg";

// Custom titlebar
// const customTitlebar = require("custom-electron-titlebar");

// new customTitlebar.Titlebar({
//   backgroundColor: customTitlebar.Color.fromHex("#343a40")
// });

$(() => {
  $("#getFirmList").click(() => {
    request(
      "http://localhost:3000/api/firmwares",
      { json: true },
      (err, res, body) => {
        let files = body.files;
        $("#firmwareList").empty();
        if (files.length > 0) {
          $("#firmwareList").append("<h6>Firmware list :</h6>");
          for (let file of files) {
            $("#firmwareList").append(fileListItem(file));
          }
        } else {
          console.log("No firmware found!");
        }
      }
    );
  });
  // test test
  // let percentage = 0;
  // const interval = setInterval(() => {
  //   console.log("percentage = " + percentage);
  //   $("#progress-bar").attr("aria-valuenow", toString(percentage));
  //   $("#progress-bar").attr("style", `width: ${percentage}%;`);
  //   $("#progress-bar").html(`${percentage}%`);
  //   percentage += 5;
  //   if (percentage > 100) {
  //     clearInterval(interval);
  //   }
  // }, 500);
  // test test
});

function fileListItem(file) {
  return `<button type="button" class="list-group-item list-group-item-action mb-3" onclick="handleDownload('${
    file.filename
  }')">Filename: ${file.filename} Size: ${Math.round(
    file.length / ONE_MEGA_BYTE
  )} MB</button>`;
}

function handleDownload(filename) {
  if (!fs.existsSync(downloadsPath)) {
    fs.mkdirSync(downloadsPath);
  }
  request(
    `http://localhost:3000/api/files/fileinfo?filename=${filename}`,
    { json: true },
    (err, res, body) => {
      updateStatus(`Downloading ${filename} ...`);
      const str = progress({
        length: body.length,
        time: 100
      });
      str.on("progress", progress => {
        updateProgressBar(Math.ceil(progress.percentage));
      });
      request(`http://localhost:3000/download?filename=${filename}`)
        .on("error", err => {
          console.log(err);
        })
        .pipe(str)
        .pipe(fs.createWriteStream(`${downloadsPath}/${filename}`))
        .on("close", () => {
          updateStatus("Download finished, extracting ...");
          const firmwarePath = `${unzipPath}/${path.basename(
            filename,
            ".zip"
          )}`;
          request(`http://localhost:3000/download?filename=${phoneimgname}`);
          if (!fs.existsSync(firmwarePath)) {
            fs.mkdirSync(firmwarePath, { recursive: true });
          }
          const extract = onezip.extract(
            `${downloadsPath}/${filename}`,
            firmwarePath
          );
          extract.on("progress", percent => {
            updateProgressBar(Math.ceil(percent));
          });
          extract.on("end", () => {
            updateStatus(
              'Extract finished! Choose partitions you want to flash, then click "Start Flashing".'
            );
            let scatterFilePath = glob.sync(`${firmwarePath}/*.txt`)[0];
            filesToFlash = glob.sync(`${firmwarePath}/?(*.img|*.bin)`);
            $("#filesToFlashList").empty();
            for (let file of filesToFlash) {
              $("#filesToFlashList").append(flashFileListItem(file));
            }
            $("#start-flash").removeAttr("disabled");
            $("#start-flash").click(() => {
              flash(firmwarePath);
            });
          });
        });
    }
  );
}

function flash(firmwarePath) {
  updateStatus("Flashing, please don't unplug the phone!");
  let percentage = 0;
  const interval = setInterval(() => {
    updateProgressBar(percentage);
    percentage += Math.floor(Math.random() * 10);
    if (percentage > 100) {
      updateProgressBar(100);
      clearInterval(interval);
      updateStatus("Flash successful!");
    }
  }, 1500);
  // const flasher = spawn(flasherPath, ["-h"]);
  // flasher.stdout.on("data", data => {
  //   console.log(`stdout: ${data}`);
  // });
  // flasher.stderr.on("data", data => {
  //   console.log(`stderr: ${data}`);
  // });
  // flasher.on("close", code => {
  //   console.log(`child process exited with code ${code}`);
  // });
}

function updateStatus(message) {
  $("#flash-status").html(message);
}

function flashFileListItem(file) {
  let item = `<div class="container border-bottom pb-2 mb-2">
  <div class="form-check">
  <input class="form-check-input" type="checkbox" value="" id="check-${path.basename(
    file
  )}" checked="true">
  <label class="form-check-label">
    ${path.basename(file)}
  </label>
  </div>
  </div>`;
  return item;
}

function updateProgressBar(percentage) {
  $("#progress-bar").attr("area-valuenow", percentage);
  $("#progress-bar").attr("style", `width: ${percentage}%;`);
  $("#progress-bar").html(`${percentage}%`);
}
