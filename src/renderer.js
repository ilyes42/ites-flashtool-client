const $ = require("../node_modules/jquery/dist/jquery");
require("../node_modules/bootstrap/dist/js/bootstrap.bundle");

const fs = require("fs");
const path = require("path");
const request = require("request");
const onezip = require("onezip");
const glob = require("glob");
const progress = require("progress-stream");
const { execFile } = require("child_process");

const downloadsPath = path.resolve(__dirname, "../downloadedFirmwares");
const unzipPath = path.resolve(__dirname, "../extractedFirmwares");
const flasherPath = path.resolve(__dirname, "../flasher/flash_tool.exe");

const ONE_MEGA_BYTE = 1048576;
const phoneimgname = "ipro.jpg";

let currentFirmware = null;

// Custom titlebar
// const customTitlebar = require("custom-electron-titlebar");

// new customTitlebar.Titlebar({
//   backgroundColor: customTitlebar.Color.fromHex("#343a40")
// });

$(() => {
  $("#getFirmList").click(checkServerFirms);
  $("#getLocalFirmList").click(checkLocalFirms);
  $("#start-flash").click(() => flash(currentFirmware));
  checkLocalFirms();
  checkServerFirms();
});

function checkServerFirms() {
  request(
    "http://localhost:3000/api/firmwares",
    { json: true },
    (err, res, body) => {
      if (!err) {
        $("#firmwareList").empty();
        let files = body.files;
        if (files.length > 0) {
          for (let file of files) {
            $("#firmwareList").append(fileListItem(file));
          }
        } else {
          $("#firmwareList").append(
            simpleAlert("There are no firmwares on the server.")
          );
        }
      } else {
        $("#firmwareList").empty();
        $("#firmwareList").append(simpleAlert("Error, No server connection!"));
      }
    }
  );
}

function checkLocalFirms() {
  $("#localFirmwareList").empty();
  let localFirmwares = glob.sync(`${unzipPath}/*`);
  if (localFirmwares.length > 0) {
    for (let firmware of localFirmwares) {
      let f = path.basename(firmware);
      $("#localFirmwareList").append(
        `<button type="button" class="list-group-item list-group-item-action mb-3" onclick="handleFlash('${firmware}', '${f}')">${f}</button>`
      );
    }
  } else {
    $("#localFirmwareList").append(simpleAlert("No firmwares found locally."));
  }
}

function fileListItem(file) {
  return `<button type="button" class="list-group-item list-group-item-action mb-3" onclick="handleDownload('${
    file.filename
  }')">Filename: ${file.filename}<br />Size: ${Math.round(
    file.length / ONE_MEGA_BYTE
  )} MB</button>`;
}

function handleDownload(filename) {
  $("#start-flash").attr("disabled", true);
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
            updateStatus("Extract finished!");
            checkLocalFirms();
          });
        });
    }
  );
}

function handleFlash(firmwarePath, firmwareName) {
  $("#filesToFlashList").empty();
  $("#filesToFlashList").append(`<h5 class="text-center">${firmwareName}</h5>`);
  let partitions = glob.sync(`${firmwarePath}/?(*.img|*.bin)`);
  for (let part of partitions) {
    $("#filesToFlashList").append(formCheck(path.basename(part)));
  }
  currentFirmware = firmwarePath;
  $("#start-flash").attr("disabled", false);
}

function formCheck(el) {
  return `<div class="form-check">
  <input class="form-check-input" type="checkbox" checked>
  <label class="form-check-label" for="defaultCheck1">
    ${el}
  </label>
</div>`;
}

function flash(firmwarePath = currentFirmware) {
  $("#start-flash").attr("disabled", true);
  updateProgressBar(0);
  updateStatus("Flashing process will start soon...");
  // Search for scatter file
  let scatterFilePath = glob.sync(`${firmwarePath}/*.txt`)[0];
  console.log(scatterFilePath);

  let options = {
    shell: "powershell.exe"
  };

  const flasher_process = execFile(
    flasherPath.replace(/\//g, "\\"), // we use this .replace(/\//g, "\\") to make it a windows compatible path
    ["-s", scatterFilePath.replace(/\//g, "\\"), "-c", "download"],
    options
  );

  flasher_process.stdout.setEncoding("utf8");

  flasher_process.stdout.on("data", data => {
    console.log(data);
    parseTheDataAndUpdateStatus(data);
  });

  flasher_process.on("exit", (code, signal) => {
    console.log("process exited with code: " + code);
    $("#start-flash").removeAttr("disabled");
  });
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

function parseTheDataAndUpdateStatus(data) {
  if (data.search(/Search/g) !== -1) {
    updateStatus("Searching for USB port ...");
  } else if (data.search(/obtained/g) !== -1) {
    updateStatus("USB port found !!");
  } else if (data.search(/Failed to find USB port/g) !== -1) {
    updateStatus("Failed to find USB port, flashing aborted.");
  } else if (data.search(/DADownloadAll/g) !== -1) {
    updateStatus("Flashing...");
  } else if (data.search(/image/g) !== -1) {
    if (data.search(/10%/g) !== -1) {
      updateProgressBar(10);
    } else if (data.search(/20%/g) !== -1) {
      updateProgressBar(20);
    } else if (data.search(/30%/g) !== -1) {
      updateProgressBar(30);
    } else if (data.search(/40%/g) !== -1) {
      updateProgressBar(40);
    } else if (data.search(/50%/g) !== -1) {
      updateProgressBar(50);
    } else if (data.search(/60%/g) !== -1) {
      updateProgressBar(60);
    } else if (data.search(/70%/g) !== -1) {
      updateProgressBar(70);
    } else if (data.search(/80%/g) !== -1) {
      updateProgressBar(80);
    } else if (data.search(/90%/g) !== -1) {
      updateProgressBar(90);
    } else if (data.search(/100%/g) !== -1) {
      updateProgressBar(100);
    }
  } else if (data.search(/Download Succeeded/g) !== -1) {
    updateStatus("Flashing successful!");
  }
}

function simpleAlert(message) {
  return `<div class="alert alert-secondary" role="alert">
  ${message}
</div>`;
}
