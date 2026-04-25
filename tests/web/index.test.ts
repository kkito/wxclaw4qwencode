import { describe, it, expect } from 'vitest';
import { IndexPage } from '../../src/web/views/index.js';
import { jsx } from 'hono/jsx';

describe('IndexPage Component', () => {
  it('should render with correct title and version', () => {
    const html = jsx(IndexPage, { title: 'TestApp', version: '2.0.0' }).toString();

    expect(html).toContain('<title>TestApp</title>');
    expect(html).toContain('TestApp');
    expect(html).toContain('v2.0.0');
  });

  it('should render welcome content', () => {
    const html = jsx(IndexPage, { title: 'OwnClaw', version: '1.0.0' }).toString();

    expect(html).toContain('欢迎使用 OwnClaw');
    expect(html).toContain('微信消息通道');
    expect(html).toContain('快速开始');
  });

  it('should include proper HTML structure', () => {
    const html = jsx(IndexPage, { title: 'OwnClaw', version: '1.0.0' }).toString();

    expect(html).toContain('<html lang="zh-CN">');
    expect(html).toContain('<meta charset="utf-8"');
    expect(html).toContain('<meta name="viewport"');
    expect(html).toContain('<style');
    expect(html).toContain('</html>');
  });

  it('should include CSS styles', () => {
    const html = jsx(IndexPage, { title: 'OwnClaw', version: '1.0.0' }).toString();

    expect(html).toContain(':root');
    expect(html).toContain('--background');
    expect(html).toContain('--foreground');
    expect(html).toContain('.container');
    expect(html).toContain('.header');
    expect(html).toContain('.card');
  });

  it('should have proper semantic structure', () => {
    const html = jsx(IndexPage, { title: 'OwnClaw', version: '1.0.0' }).toString();

    expect(html).toContain('<header class="header">');
    expect(html).toContain('<main class="content">');
    expect(html).toContain('<footer class="footer">');
  });

  it('should render footer with copyright', () => {
    const html = jsx(IndexPage, { title: 'OwnClaw', version: '1.0.0' }).toString();

    expect(html).toContain('OwnClaw © 2026');
  });
});
