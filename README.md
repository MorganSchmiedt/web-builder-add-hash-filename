## Web Builder Module - Add Hash to Filename

This module allows the [@deskeen/web-builder](https://github.com/deskeen/web-builder) to add the file hash to the file names.


## Install

```
npm install @deskeen/web-builder
npm install @deskeen/web-builder-add-hash-filename
```


### Usage

Add the module to the list of modules: 

```javascript
const builder = require('@deskeen/web-builder')
await builder.build({
  source: [
    // List of files or directories that include inlineSVG tags
    // {{inlineJSON:file.json}}
  ],
  modules: [
    [
      '@deskeen/web-builder-add-hash-filename',
      {
        // Starting points
        // Can be a function or a list of files
        entries: file => file.endsWith('.html'),
        assets: [
          // List of directories that include the files
          // noted in the addHash tags
        ],
      }
    ]
  ]
})
```


### Example

Let's consider the following files:

*/www/index.html*
```html
<!DOCTYPE html>
<html>
  <head>
    <meta charset="utf-8">
    <link href="{{addHash:style.css}}" rel="stylesheet" type="text/css">
    <title>Pink is the new Black</title>
  </head>
  <body>
    <!-- My cool page -->
  </body>
</html>
```

*/www/css/style.css*
```css
body {
  background-color: pink;
}
```

Build the project by running:
```javascript
await builder.build({
    source: ['/www'],
    modules: [
      [
        '@deskeen/web-builder-add-hash-filename',
        {
          entries: file => file.endsWith('.html'),
          assets: ['/www/css'],
        }
      ]
    ]
  })
```

Two things happen:
- The index file now contains: `<link href="style.cb163438387622e1354d9613a8f44dfa.css"`
- The style file is renamed to: `style.cb163438387622e1354d9613a8f44dfa.css`


## Contact

You can reach me at {my_firstname}@{my_name}.fr


## Licence

MIT Licence - Copyright (c) Morgan Schmiedt