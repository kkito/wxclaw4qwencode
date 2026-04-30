/**
 * ACP 连接管理
 * 负责启动 qwen --acp 子进程、建立 ACP 连接、管理连接生命周期
 */

import { spawn, ChildProcess } from 'node:child_process';
import { Readable, Writable } from 'node:stream';
import {
  ClientSideConnection,
  ndJsonStream,
  type Stream,
  type Client,
  type Agent,
  type InitializeRequest,
  type InitializeResponse,
} from '@agentclientprotocol/sdk';
import { AcpClientOptions } from './types.js';

export class AcpConnection {
  private child: ChildProcess | null = null;
  private connection: ClientSideConnection | null = null;

  /**
   * 启动 qwen --acp 进程并建立 ACP 连接
   */
  async start(options: AcpClientOptions, clientFactory: (agent: Agent) => Client): Promise<ClientSideConnection> {
    const cliPath = options.cliPath ?? 'qwen';
    const args = ['--acp'];

    if (options.model) {
      args.push('--model', options.model);
    }

    console.error(`[连接] 启动 qwen --acp 进程...`);
    console.error(`[连接] 命令: ${cliPath} ${args.join(' ')}`);
    console.error(`[连接] 工作目录: ${options.cwd}`);

    // 直接启动 qwen 进程，不通过 node
    this.child = spawn(cliPath, args, {
      cwd: options.cwd,
      stdio: ['pipe', 'pipe', 'pipe'],
      env: { ...process.env },
      shell: false,
    });

    // 监听子进程的 stderr（日志输出）
    this.child.stderr?.on('data', (data) => {
      const msg = data.toString().trim();
      if (msg) {
        console.error(`[qwen日志] ${msg}`);
      }
    });

    // 监听子进程退出
    this.child.on('exit', (code, signal) => {
      console.error(`\n[连接] qwen 进程已退出 (code=${code}, signal=${signal})`);
      this.connection = null;
      this.child = null;
    });

    // 等待进程启动
    await new Promise((resolve) => setTimeout(resolve, 1000));

    if (!this.child || this.child.killed) {
      throw new Error('qwen --acp 进程启动失败');
    }

    // 建立 ACP 通信流
    const stdin = Writable.toWeb(this.child.stdin as Writable);
    const stdout = Readable.toWeb(this.child.stdout as Readable);
    const stream: Stream = ndJsonStream(
      stdin as WritableStream<Uint8Array>,
      stdout as ReadableStream<Uint8Array>,
    );

    // 创建 ACP 客户端连接
    this.connection = new ClientSideConnection(clientFactory, stream);

    // 初始化连接（协商协议版本和能力）
    console.error(`[连接] 正在初始化 ACP 连接...`);
    const initRequest: InitializeRequest = {
      protocolVersion: 1,
      clientCapabilities: {},
    };
    const initResponse: InitializeResponse = await this.connection.initialize(initRequest);

    console.error(`[连接] ACP 连接已建立`);
    console.error(`[连接] 协议版本: ${initResponse.protocolVersion}`);
    if (initResponse.agentCapabilities?._meta) {
      console.error(`[连接] Agent 元数据: ${JSON.stringify(initResponse.agentCapabilities._meta).slice(0, 100)}`);
    }

    return this.connection;
  }

  /**
   * 获取 ACP 连接实例
   */
  getConnection(): ClientSideConnection | null {
    return this.connection;
  }

  /**
   * 关闭连接和子进程
   */
  async close(): Promise<void> {
    // 先关闭 stdin 让 qwen 正常退出
    if (this.child?.stdin && !this.child.stdin.destroyed) {
      this.child.stdin.end();
    }

    this.connection = null;

    // 等待进程退出（有超时保护）
    if (this.child && !this.child.killed) {
      const child = this.child;
      await new Promise<void>((resolve) => {
        const timeout = setTimeout(() => {
          if (!child.killed) {
            child.kill('SIGKILL');
          }
          resolve();
        }, 3000);

        child.on('exit', () => {
          clearTimeout(timeout);
          resolve();
        });
      });
    }

    this.child = null;
    console.error(`[连接] 连接已关闭`);
  }

  /**
   * 获取子进程实例
   */
  getChildProcess(): ChildProcess | null {
    return this.child;
  }
}
