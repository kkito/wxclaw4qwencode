#!/usr/bin/env node

import { parseArgs } from 'util';
import { bindCommand } from './cli/bind.js';
import { unbindCommand } from './cli/unbind.js';
import { statusCommand } from './cli/status.js';

const { positionals, values } = parseArgs({
  options: {
    help: { type: 'boolean', short: 'h' },
  },
  allowPositionals: true,
});

const subcommand = positionals[0];

switch (subcommand) {
  case 'bind':
    await bindCommand();
    break;
  case 'unbind':
    await unbindCommand();
    break;
  case 'status':
    await statusCommand();
    break;
  default:
    console.log(`
用法: node dist/cli.js <子命令>

子命令:
  bind    绑定微信
  unbind  解绑微信
  status  查看绑定状态

选项:
  -h, --help  显示帮助
`);
    process.exit(subcommand ? 1 : 0);
}