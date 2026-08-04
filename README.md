# mcp-sefaria

Sefaria MCP — the free digital library of Jewish texts.

Part of [Pipeworx](https://pipeworx.io) — an MCP gateway connecting AI agents to 1394+ live data sources.

## Tools

| Tool | Description |
|------|-------------|
| `get_text` | Fetch a passage of Jewish text from Sefaria by reference, in Hebrew and/or English. Works for Torah/Tanakh, Talmud, Mishnah, Midrash, Halacha, Kabbalah, and commentaries. Keyless. |
| `lookup_ref` | Validate or autocomplete a Sefaria reference or title (e.g. "Genesis", "Rashi", "Berakhot"). Returns whether it is a valid reference/book and a list of completions. Keyless. |
| `get_commentaries` | List the commentaries and cross-references on a passage (e.g. Rashi, Targum, quoting commentaries) from Sefaria's link graph. Keyless. |

## Quick Start

Add to your MCP client (Claude Desktop, Cursor, Windsurf, etc.):

```json
{
  "mcpServers": {
    "sefaria": {
      "url": "https://gateway.pipeworx.io/sefaria/mcp"
    }
  }
}
```

Or connect to the full Pipeworx gateway for access to all 1394+ data sources:

```json
{
  "mcpServers": {
    "pipeworx": {
      "url": "https://gateway.pipeworx.io/mcp"
    }
  }
}
```

## Using with ask_pipeworx

Instead of calling tools directly, you can ask questions in plain English:

```
ask_pipeworx({ question: "your question about Sefaria data" })
```

The gateway picks the right tool and fills the arguments automatically.

## More

- [Docs and guides](https://pipeworx.io/docs)
- [pipeworx.io](https://pipeworx.io)

## License

MIT
