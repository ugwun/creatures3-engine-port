# Welcome to the Creatures 3 Developer Wiki

Welcome to the internal documentation wiki for the Creatures 3 Developer Tools!

This space is dedicated to collecting, organizing, and evolving our knowledge base as we continue to develop the engine, tools, and the Genetics Kit. Because this wiki is embedded directly into the developer tools, it serves as a live, instantly-accessible reference guide for anyone working on the project.

## How to use this Wiki

The wiki is powered by a static JSON index (`tools/docs/index.json`) and Markdown files (`.md`) stored directly in the `tools/docs/` directory.

### Adding a new page

1. Create a new Markdown file in the `tools/docs/` directory (e.g., `tools/docs/my_new_feature.md`).
2. Write your documentation using standard Markdown syntax. You can use headers, code blocks, lists, and tables!
3. Open `tools/docs/index.json` and add a new entry to the array:

```json
{
  "title": "My New Feature",
  "file": "my_new_feature.md"
}
```

4. Refresh the Developer Tools in your browser, and your new page will appear in the sidebar!

### Linking between pages

You can link directly to other wiki pages using standard Markdown link syntax. For example, to link to a file named `engine_internals.md`, you would write:

```markdown
Check out the [Engine Internals](engine_internals.md) page for more info.
```

Clicking these links will seamlessly load the new page without refreshing the browser.

## Upcoming Documentation

As we expand the engine capabilities and the AI agent integration (MCP), we plan to document the following areas here:

* **Genetics Kit Workflows:** Detailed guides on hatching, injecting, and crossing genomes.
* **Brain & Biochemistry:** In-depth explanations of SV Rules, Lobes, Tracts, and the 256 chemicals.
* **CAOS Reference:** A handy guide to the CAOS virtual machine opcodes and scripting patterns.
* **Debug Server API:** Endpoints and payload schemas for the embedded HTTP/SSE server.

Happy documenting!
