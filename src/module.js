'use strict'
/* eslint-env node, es6 */

const {
  createHash,
} = require('crypto')

const {
  readFile,
} = require('fs')

const {
  basename,
  dirname,
  extname,
  join,
} = require('path')

const {
  promisify,
} = require('util')

const readFileAsync = promisify(readFile)

const getHashedName = (path, hash) => {
  const directory = dirname(path)
  const extension = extname(path)
  const name = basename(path, extension)

  return join(directory, `${name}.${hash}${extension}`)
}

const TAGNAME = 'addHash'

/**
 * Adds asset content hash
 *
 * @param {Map} fileMap List of files to process, given by engine
 * @param {object} opt Options
 * @param {array} opt.assets List of folders that include assets
 * @param {array|function} opt.entries Entry files
 * @param {string} [opt.hash_algorithm=md5] Hash algorithm
 * @param {string} [opt.encoding=utf8] Asset encoding
 */
module.exports = async(fileMap, opt, lib) => {
  const algorithm = opt.hash_algorithm || 'md5'
  const encoding = 'utf8'
  const assets = opt.assets
  const {
    getTag,
    getTagList,
    findAsset,
    log,
  } = lib

  if (opt == null
    || opt.assets == null) {
    throw new Error('List of asset directories not given!')
  }

  const originalNamesMap = new Map()
  const depHashList = new Map()

  // Build dependencies tree
  const depMap = new Map()

  await Promise.all(Array.from(fileMap.entries())
    .map(([filePath, fileContent]) => {
      const depList = getTagList(TAGNAME, fileContent)

      if (depList.length === 0) {
        return
      }

      return Promise.all(
        depList.map(depPath =>
          findAsset(depPath, assets)
            .then(fullPath => {
              originalNamesMap.set(fullPath, depPath)

              return fullPath
            })))
        .then(depPathList => {
          const obj = {}

          depPathList.forEach(path => obj[path] = null)

          depMap.set(filePath, obj)
        })
    }))

  // Shortcut function
  const getFileContent = path => {
    if (fileMap.has(path)) {
      return Promise.resolve(fileMap.get(path))
    }

    return readFileAsync(path, encoding)
  }

  // Only rename files that are a dependency of another file.
  // Some entry files may not necessarly need to be replaced.
  const setHash = (depPath, depHash) => {
    const filesWithHash =
      Array.from(depMap.entries()).filter(([, value]) =>
        value[depPath] !== undefined)

    if (filesWithHash.length) {
      depHashList.set(depPath, depHash)

      filesWithHash.forEach(([key, value]) => {
        value[depPath] = depHash
        depMap.set(key, value)
      })
    }
  }

  const setSingleHash = path =>
    setCombineHash([path])

  const setCombineHash = pathList =>
    Promise.all(pathList.map(path => getFileContent(path, encoding)))
      .then(contentList => {
        let hash

        const filesHash = createHash(algorithm)
          .update(contentList.join(''))
          .digest('hex')

        const depHashList = []

        pathList
          .map(path => depMap.get(path))
          .filter(obj => obj != null)
          .forEach(depObj => {
            depHashList.push(...Object.keys(depObj).map(key => depObj[key]))
          })

        if (depHashList.length === 0) {
          hash = filesHash
        } else {
          hash = createHash(algorithm)
            .update(filesHash + depHashList.join(''))
            .digest('hex')
        }

        pathList.forEach(path =>
          setHash(path, hash))
      })

  // Mark a dependency
  const markDep = (file, dep, tag = 'processed') => {
    const obj = depMap.get(file)
    obj[dep] = tag

    depMap.set(file, obj)
  }

  // Mark dep that have a self dep
  // Tag them as self so the engine doesnt take it into account
  Array.from(depMap.entries()).forEach(([file, obj]) => {
    if (obj[file] === null) {
      markDep(file, file, 'self')
    }
  })

  // Routine
  const run = async initial => {
    log(`Entry ${initial}`)

    // Initialize breadcrumb
    const breadcrumb = [initial]

    // Shortcut function to get the last item of the breadcrumb
    const getLast = array => array[array.length - 1]

    // Cercles are lists of dependencies that have references to each others
    // ie. loop
    const cercles = []

    // Go through all available paths
    while (breadcrumb.length) {
      // Current location
      const currentName = getLast(breadcrumb)

      // Dep is defined in the Map if it has at least 1 dep
      if (depMap.has(currentName)) {
        // File dependencies
        const currentFile = depMap.get(currentName)

        // Find a dep that has not yet been processed
        const depName = Object.keys(currentFile)
          .find(keyChild => currentFile[keyChild] === null)

        if (depName) {
          // Dep to process found
          log(`Process ${depName} in ${currentName}`)

          // Search loops, ie reference to items that are already in the chain
          const loopIndex = breadcrumb.indexOf(depName)
          const hasLoop = loopIndex > -1

          if (hasLoop) {
            // Loop found
            // log('Loop detected', 4)

            // Create a circle from the last item of the chain,
            // til the loop index
            // ie. these items are all linked
            const cercle = breadcrumb.slice(loopIndex)

            cercles.push(cercle)

            // Set current path as processed not to do it again in this run
            // Will be done on the next run, once cercles will be processed
            for (let i = 0; i < breadcrumb.length - 1; i += 1) {
              markDep(breadcrumb[i], breadcrumb[i + 1])
              // log(`Mark ${breadcrumb[i + 1]} in ${breadcrumb[i]}`, 4)
            }
            markDep(currentName, depName)
            // log(`Mark ${depName} in ${currentName}`, 4)
          } else {
            // If it does not refer to an item of the chain, ie no loop
            // Follow the route
            // log(`Goto: ${depName}`)

            breadcrumb.push(depName)
          }
        } else {
          // ...No more dep to process in the file
          const depProcessed = Object.keys(currentFile)
            .find(depName => currentFile[depName] === 'processed')

          const containsLoop = depProcessed != null

          // log(`No more dep:  ${currentName}`, 2)

          if (containsLoop) {
            // Add this dep to the existing dep circle
            cercles.push([currentName, depProcessed])

            // Set current path as processed not to do it again
            // Will be done on the next run
            for (let i = 0; i < breadcrumb.length - 1; i += 1) {
              markDep(breadcrumb[i], breadcrumb[i + 1])
              // log('No replace because of loops', 4)
              // log(`Mark ${breadcrumb[i + 1]} in ${breadcrumb[i]}`, 4)
            }
          } else {
            // No loop in the file
            log(`Replace: ${currentName}`, 2)

            await setSingleHash(currentName)
          }

          // log(`Go back: ${breadcrumb[breadcrumb.length - 2]}`, 2)

          breadcrumb.pop()
        }
      } else {
        // No dep at all in the file
        // log(`Replace: ${currentName} - no dep at all`, 2)

        // Replace it everywhere
        await setSingleHash(currentName)

        // End of path
        // Go up to find another path
        breadcrumb.pop()
      }
    }

    // Combine cercles to share the same items
    // log(`Found ${cercles.length} cercles`)

    while (cercles.length) {
      const cercle = getLast(cercles)
      const cercleSet = new Set(cercle)

      cercles.pop()

      for (const cercleItem of cercleSet.keys()) {
        let i = 0

        while (i < cercles.length) {
          const otherCicle = cercles[i]

          // If one item is shared by the 2 circles, combine the arrays
          if (otherCicle.includes(cercleItem)) {
            otherCicle.forEach(otherItem => cercleSet.add(otherItem))

            cercles.splice(i, 1)
          } else {
            i += 1
          }
        }
      }

      const newCercle = Array.from(cercleSet)

      log(`Replace cercle with ${newCercle.length} items`, 2)
      log(newCercle.join('\n'), 2)

      await setCombineHash(newCercle)
    }
  }

  // Reset processed items to allow engine to pass again
  const resetRun = () => {
    let hasChange = false

    Array.from(depMap.entries()).forEach(([file, obj]) => {
      Object.keys(obj).forEach(property => {
        if (obj[property] === 'processed') {
          obj[property] = null
          hasChange = true
        }
      })

      depMap.set(file, obj)
    })

    return hasChange
  }

  // Generate entry files from paramters
  let entries

  if (opt.entries == null) {
    throw new Error('"entries" is not provided.')
  }

  if (opt.entries.constructor.name === 'Array') {
    entries = opt.entries
  } else if (opt.entries.constructor.name === 'Function') {
    entries = Array.from(depMap.keys()).filter(file => opt.entries(file))
  } else {
    throw new Error('"entries" parameter type is not supported.')
  }

  if (entries.length === 0) {
    throw new Error('No entry')
  }

  // Run routine
  for (const initial of entries) {
    let keepRunning = true

    while (keepRunning) {
      await run(initial)

      keepRunning = resetRun()
    }
  }

  Array.from(depMap.entries()).forEach(([file, obj]) =>
    Object.keys(obj).forEach(property => {
      if (obj[property] === 'processed'
        || obj[property] == null) {
        throw `Error while adding hashes ${file}`
      }
    }))

  // Replace tag in files
  for (const [depPath, obj] of depMap.entries()) {
    let content = fileMap.get(depPath)

    for (const tag of Object.keys(obj)) {
      const hash = obj[tag]
      const originalName = originalNamesMap.get(tag)
      const tagName = getTag(TAGNAME, originalName)
      const tagValue = getHashedName(originalName, hash)

      content = content.replace(new RegExp(tagName, 'g'), tagValue)
    }

    fileMap.set(depPath, content)
  }

  // Rename files
  for (const [path, hash] of depHashList.entries()) {
    const newPath = getHashedName(path, hash)

    log(`Rename ${path} to ${newPath}`)

    fileMap.set(newPath, fileMap.get(path))
    fileMap.delete(path)
  }
}
