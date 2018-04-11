'use babel';

import { exec } from 'child_process';
import { CompositeDisposable } from 'atom';

import CommandPaletteView from './command-palette-view';
import config from './config';

export default {
  config,
  subscriptions: null,
  commandPaletteView: null,
  platformIOIDETerminal: null,
  // configs
  terminal: null,
  commands: null,
  focus: null,

  activate(state) {
    this.commandPaletteView = new CommandPaletteView(
      state.commandPaletteViewState,
      this.updateCommands.bind(this),
      this.run.bind(this)
    );
    this.commandPaletteView.update({
      useAlternateScoring: true,
      preserveLastSearch: false
    });

    this.subscriptions = new CompositeDisposable();
    this.subscriptions.add(atom.commands.add('atom-workspace', {
      'atom-taito-cli:toggle': () => this.commandPaletteView.toggle()
    }));

    this.subscribeConfig('terminal');
    this.subscribeConfig('commands');
    this.subscribeConfig('focus');
  },

  subscribeConfig(name) {
    this[name] = atom.config.get(`atom-taito-cli.${name}`);
    this.subscriptions.add(
      atom.config.observe(`atom-taito-cli.${name}`, val => {
        this[name] = val;
      })
    );
  },

  consumePlatformIOIDETerminal(terminal) {
    this.platformIOIDETerminal = terminal;
  },

  run(item) {
    const directory = atom.project.getPaths()[0];
    if (this.terminal === 'iTerm (macOS)')
      return this.runOnIterm(directory, item);
    if (this.terminal === 'Terminal (macOS)')
      return this.runOnTerminal(directory, item);
    if (this.terminal === 'platformio-ide-terminal')
      return this.runOnPlatformIOIDETerminal(directory, item);
  },

  runOnIterm(directory, item) {
    this.asyncExec(`osascript \
      -e 'tell application "iTerm"' \
      -e   '${item.focus || this.focus ? 'activate' : ''}' \
      -e   'tell current session of current window' \
      -e     'write text "cd ${directory} && ${item.command}" \
              ${item.execute ? '' : 'newline NO'}' \
      -e   'end tell' \
      -e 'end tell'
    `);
  },

  runOnTerminal(directory, item) {
    const executeCommand = item.execute
      ? `do script ("${item.command}") in front window`
      : `tell application "System Events" to keystroke "${item.command}"`;
    this.asyncExec(`osascript \
      -e 'tell application "Terminal"' \
      -e   '${item.focus || this.focus ? 'activate' : ''}' \
      -e   'do script ("cd ${directory}") in front window' \
      -e   '${executeCommand}' \
      -e 'end tell' \
    `);
  },

  runOnPlatformIOIDETerminal(directory, item) {
    const wasAlreadyOpen = !!this.platformIOIDETerminal.getTerminalViews()[0];
    if (!wasAlreadyOpen) {
      this.platformIOIDETerminal.run([
        `cd ${directory}`
      ]);
    }
    setTimeout(() => {
      const view = this.platformIOIDETerminal.getTerminalViews()[0];
      view.open();
      if (wasAlreadyOpen) view.input(`cd ${directory}\n`);
      view.input(`${item.command}`);
      if (item.execute) view.input('\n');
      if (item.focus || this.focus) view.focus();
    }, wasAlreadyOpen ? 0 : 200);
  },

  async updateCommands() {
    const commands = await this.asyncExec('taito --print-commands');
    return commands.split(/\r?\n/).map(c => {
      const split = c.split('#');
      const displayName = split[0].replace('&focus', '').trim();
      return {
        displayName,
        command: `taito ${displayName}`,
        focus: split[0].indexOf('&focus') !== -1 ||
          displayName.indexOf('[') !== -1,
        execute: displayName.indexOf('[') == -1,
        description: (split[1] || '').trim(),
        taitoCommand: true
      };
    }).concat(this.commands.map(command => {
      return {
        displayName: command,
        description: 'Additional command'
      };
    })).sort((a, b) => a.displayName.localeCompare(b.displayName));
  },

  async asyncExec(command) {
    return new Promise(function(resolve, reject) {
      exec(command, {
        cwd: atom.project.getPaths()[0]
      }, (error, stdout, stderr) => {
        if (error) {
          reject(error);
          return;
        }

        resolve(stdout.trim());
      });
    });
  },

  deactivate() {
    this.subscriptions.dispose();
    this.commandPaletteView.destroy();
  },
};
