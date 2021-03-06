import * as vscode from 'vscode';

import { TargetItem, AppItem, ProcessItem } from '../providers/devices';
import { platform, EOL } from 'os';
import { DeviceType } from '../types';
import { terminate } from '../driver/frida';
import { refresh, sleep } from '../utils';

const terminals = new Set<vscode.Terminal>();

function repl(args: string[], name: string, tool: string='frida') {
  const title = `Frida - ${name}`;  
  const [shell, rest] = platform() === 'win32' ?
    ['cmd.exe', ['/c', tool, ...args]] : [tool, args];

  const term = vscode.window.createTerminal(title, shell, rest);
  term.show();
  terminals.add(term);
}

vscode.window.onDidCloseTerminal(t => terminals.delete(t));

export function spawn(node?: AppItem) {
  if (!node) {
    vscode.window.showInformationMessage('Please use this command in the context menu of frida sidebar');
    return;
  }

  repl(['-f', node.data.identifier, '--device', node.device.id, '--no-pause'], node.data.name);
  refresh();
}

export function spawnSuspended(node?: AppItem) {
  if (!node) {
    vscode.window.showInformationMessage('Please use this command in the context menu of frida sidebar');
    return;
  }

  repl(['-f', node.data.identifier, '--device', node.device.id], node.data.name);
  refresh();
}

export function kill(node?: TargetItem) {
  if (!node) {
    return;
  }

  if ((node instanceof AppItem && node.data.pid) || node instanceof ProcessItem) {
    terminate(node.device.id, node.data.pid.toString());
    refresh();
  } else {
    vscode.window.showWarningMessage(`Target is not running`);
  }
}

export function attach(node?: TargetItem) {
  if (!node) {
    // todo: select from list
    return;
  }

  if (node instanceof AppItem || node instanceof ProcessItem) {
    if (!node.data.pid) {
      vscode.window.showErrorMessage(`App "${node.data.name}" must be running before attaching to it`);
    }

    const device = node.device.type === DeviceType.Local ? [] : ['--device', node.device.id];
    repl([node.data.pid.toString(), ...device], node.data.pid.toString());
  }
}

export async function load() {
  const { activeTextEditor, activeTerminal, showErrorMessage } = vscode.window;
  if (!activeTextEditor) {
    showErrorMessage('No active document');
    return;
  }

  if (terminals.size === 0) {
    showErrorMessage('No active frida REPL');
    return;
  }

  let term: vscode.Terminal | null = null;
  if (activeTerminal && terminals.has(activeTerminal)) {
    term = activeTerminal;
  } else if (terminals.size === 1) {
    term = terminals.values().next().value as vscode.Terminal;
    term.show();
  } else {
    showErrorMessage('You have multiple REPL instances. Please activate one');
    return;
  }

  const { document } = activeTextEditor;
  term.sendText(
    platform() === 'win32' || document.isDirty ? // bug: %load doesn't seem to handle path right on Windows
    document.getText() : `%load ${document.uri.fsPath}`);
  await sleep(100);
  term.sendText(EOL);
}
