import { mkdtemp, mkdir, readFile, realpath, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import { resolvePrivatePath } from '@/lib/private-files';
import { writePrivateMedia } from '@/modules/media/storage';

const tempRoots: string[] = [];

async function createPrivateRoot() {
  const root = await mkdtemp(path.join(tmpdir(), 'limpiador-private-'));
  tempRoots.push(root);
  return root;
}

afterEach(async () => {
  await Promise.all(
    tempRoots.splice(0).map(async (root) => {
      await import('node:fs/promises').then(({ rm }) => rm(root, { recursive: true, force: true }));
    }),
  );
});

describe('resolvePrivatePath', () => {
  it('resolves valid nested private keys inside the canonical root', async () => {
    const root = await createPrivateRoot();
    await mkdir(path.join(root, 'whatsapp-media', 'asset-1'), { recursive: true });

    const resolved = await resolvePrivatePath(root, 'whatsapp-media/asset-1/image.jpg');

    expect(resolved).toBe(path.join(await realpath(root), 'whatsapp-media', 'asset-1', 'image.jpg'));
  });

  it('rejects traversal, absolute paths, encoded escapes, separator confusion, Windows prefixes, and NUL bytes', async () => {
    const root = await createPrivateRoot();
    const invalidKeys = [
      '../secret.txt',
      'whatsapp-media/../../secret.txt',
      '/etc/passwd',
      'C:/Windows/win.ini',
      'C:\\Windows\\win.ini',
      '//server/share/file.txt',
      '\\\\server\\share\\file.txt',
      'whatsapp-media\\asset-1\\image.jpg',
      'whatsapp-media/%2e%2e/secret.txt',
      'whatsapp-media/%2e%2e%5csecret.txt',
      'whatsapp-media/asset-1/image.jpg\0.png',
    ];

    await Promise.all(
      invalidKeys.map(async (storageKey) => {
        await expect(resolvePrivatePath(root, storageKey)).rejects.toThrow('Invalid private file path');
      }),
    );
  });

  it('rejects symlink escapes when the target can be resolved', async () => {
    const root = await createPrivateRoot();
    const outside = await createPrivateRoot();
    await writeFile(path.join(outside, 'secret.txt'), 'sensitive');
    const linkPath = path.join(root, 'linked-outside');
    await symlink(outside, linkPath, process.platform === 'win32' ? 'junction' : 'dir');

    await expect(resolvePrivatePath(root, 'linked-outside/secret.txt')).rejects.toThrow('Invalid private file path');
  });

  it('writes private media through the shared containment helper and rejects escaped write targets', async () => {
    const root = await createPrivateRoot();
    const outside = await createPrivateRoot();
    const linkPath = path.join(root, 'linked-outside');
    await symlink(outside, linkPath, process.platform === 'win32' ? 'junction' : 'dir');

    await writePrivateMedia(root, 'whatsapp-media/asset-1/image.jpg', Buffer.from('image-bytes'));
    await expect(readFile(path.join(root, 'whatsapp-media', 'asset-1', 'image.jpg'), 'utf8')).resolves.toBe('image-bytes');

    await expect(writePrivateMedia(root, 'linked-outside/escape.jpg', Buffer.from('escape'))).rejects.toThrow(
      'Invalid private file path',
    );
    await expect(readFile(path.join(outside, 'escape.jpg'), 'utf8')).rejects.toMatchObject({ code: 'ENOENT' });
  });
});
