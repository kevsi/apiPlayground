# Configuration du serveur MCP Reqly

Reqly expose un serveur MCP (Model Context Protocol) **local**, démarré directement depuis l'application. Il écoute sur le port **3311** de votre machine (`http://127.0.0.1:3311/mcp`).

> Le serveur MCP ne tourne que lorsque Reqly est lancé. Démarrez Reqly (et assurez-vous que le serveur MCP est actif dans les paramètres) avant de connecter un client.

La configuration ci-dessous est générée par Reqly. Dans les paramètres, le bouton **« Copier la config MCP »** copie directement le bloc Claude Desktop — vous n'avez rien à modifier à la main.

## 1. Claude Desktop

Ouvrez le fichier de configuration `claude_desktop_config.json` (menu Claude Desktop → _Settings_ → _Developer_ → _Edit Config_) et collez-y le bloc suivant :

```json
{
  "mcpServers": {
    "reqly": {
      "command": "npx",
      "args": ["-y", "mcp-remote", "http://127.0.0.1:3311/mcp"]
    }
  }
}
```

Redémarrez Claude Desktop. Le serveur **reqly** apparaît alors dans la section _MCP Servers_.

## 2. Cursor

Dans Cursor, allez dans **Settings → MCP → Add new MCP server** et renseignez l'URL du serveur :

```
http://127.0.0.1:3311/mcp
```

Cursor se connecte au serveur en mode _streamable HTTP_ ; aucune installation de paquet supplémentaire n'est nécessaire côté client.

## 3. Autre client compatible MCP

Tout client prenant en charge le protocole MCP peut se connecter à l'URL générique suivante :

```
http://127.0.0.1:3311/mcp
```

Renseignez simplement cette URL dans la configuration MCP de votre outil (nom de serveur suggéré : `reqly`).

## Dépannage

- **Le client ne se connecte pas** : vérifiez que Reqly est ouvert et que le serveur MCP tourne sur le port 3311.
- **Conflit de port** : si le port 3311 est déjà utilisé, ajustez l'URL avec le port effectif dans la configuration de votre client.
- **Claude Desktop** utilise `mcp-remote` via `npx` : une connexion Internet est requise au premier lancement pour récupérer le paquet.
