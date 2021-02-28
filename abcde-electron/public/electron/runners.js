const child_process = require("child_process");
const fs = require("fs");
const usersPath = "D:\\Downloads";

const getCodeToken = (event, deeplinkingUrl, logEverywhere) => {
  logEverywhere(`getCodeToken ${deeplinkingUrl[0]}`);
  event.reply("asynchronous-reply", deeplinkingUrl[0]);
  return deeplinkingUrl;
};

const deleteCodeToken = (deeplinkingUrl, logEverywhere) => {
  logEverywhere(`deleteCodeToken ${deeplinkingUrl[0]}`);
  return [""];
};

const runProgram = (data) => {
  fs.writeFileSync(usersPath + "\\abcde_temp.py", data);
  let bat_file = "activate abcde_env && python -u abcde_temp.py";
  fs.writeFileSync(usersPath + "\\run_abcde_temp.bat", bat_file);
  const child = child_process.spawn(
    "cmd.exe",
    ["/c", "run_abcde_temp.bat & del abcde_temp.py & del run_abcde_temp.bat"],
    {
      encoding: "utf8",
      detached: true,
      shell: true,
      cwd: usersPath,
    }
  );
};

const createUI = (data) => {
  data = data.replace(/"/g, '\\"');
  data = data.replaceAll("\n", "\\n");

  fs.copyFile(
    "D:DocumentsApp Developmentabcde-electronpubliccreate_ui.py",
    usersPath + "\\create_ui.py"
  );
  let bat_file = "activate abcde_env && python -u create_ui.py %1";
  fs.writeFileSync(usersPath + "\\run_abcde_temp.bat", bat_file);
  const child = child_process.spawn(
    "cmd.exe",
    [
      "/c",
      `run_abcde_temp.bat "${data}" & del create_ui.py & del run_abcde_temp.bat`,
    ],
    {
      encoding: "utf8",
      detached: true,
      shell: true,
      cwd: usersPath,
    }
  );
};


exports.getCodeToken = getCodeToken
exports.deleteCodeToken = deleteCodeToken
exports.runProgram = runProgram
exports.createUI = createUI