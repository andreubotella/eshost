'use strict';
const Agent = require('./Agent.js');
const fs = require('fs');
const writeFile = promisify(fs.writeFile);
const cp = require('child_process');
const temp = require('temp');
const ErrorParser = require('./parseError.js');

class ConsoleAgent extends Agent {
  constructor(options) {
    super(options);
    this.printCommand = 'print';
  }

  createChildProcess(args) {
    args = args || [];
    args = args.concat(this.args);
    return cp.spawn(this.hostPath, args);
  }

  receiveOut(cp, str) {
    return str;
  }

  receiveErr(cp, str) {
    return str;
  }

  evalScript(code) {
    const d = deferred();
    const tempfile = temp.path({ suffix: '.js' });

    code = this.compile(code);

    writeFile(tempfile, code)
    .then(_ => {
      const cp = this.createChildProcess([tempfile]);
      let stdout = '';
      let stderr = '';

      cp.stdout.on('data', str => { stdout += this.receiveOut(cp, str); });
      cp.stderr.on('data', str => { stderr += this.receiveErr(cp, str); });
      cp.on('close', function () {
        fs.unlink(tempfile);

        const result = this.normalizeResult({ stderr: stderr, stdout: stdout });

        result.error = this.parseError(result.stderr);
        d.resolve(result);
      }.bind(this));
    }).catch(err => {
      d.reject(err);
    });


    return d.promise;
  }

  compile (code, options) {
    code = super.compile(code, options);
    const runtime = this.constructor.runtime;
    if (!runtime) {
      return code;
    } else {
      const prologue = code.match(/^("[^\r\n"]*"|'[^\r\n']*'|[\s\r\n;]*|\/\*[\w\W]*?\*\/|\/\/[^\n]*\n)*/);

      if (prologue) {
        return prologue[0] + runtime + code.slice(prologue[0].length);
      } else {
        return runtime + code;
      }
    }
  }

  // Normalizes raw output from a console host. Default is no normalization.
  // D8 agent has does some normalization to move stdout errors
  normalizeResult(result) { return result; }
  finalize () { return Promise.resolve(); }

  parseError(str) {
    return ErrorParser.parse(str);
  }
}

module.exports = ConsoleAgent;

function deferred() {
  let res, rej;
  const p = new Promise(function (resolve, reject) {
    res = resolve;
    rej = reject;
  });

  return { promise: p, resolve: res, reject: rej };
}

function promisify(api) {
  return function () {
    let args = Array.prototype.slice.call(arguments);
    return new Promise(function(res, rej) {

      args.push(function (err, result) {
        if (err) { return rej(err); }
        return res(result);
      });

      api.apply(null, args);
    });
  };
}