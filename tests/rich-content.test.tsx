import { test, expect, describe } from 'bun:test';
import { renderToStaticMarkup } from 'react-dom/server';

import RichContent from '~/components/commons/RichContent';

describe('RichContent', () => {
  test('renders rich Markdown and removes unsafe HTML', () => {
    const html = renderToStaticMarkup(
      <RichContent content={'# Project\n\n![](https://example.com/image.png)\n\n<script>alert(1)</script>'} />
    );

    expect(html).toContain('<h1>Project</h1>');
    expect(html).toContain('<img src="https://example.com/image.png"');
    expect(html).not.toContain('<script>');
  });
});
