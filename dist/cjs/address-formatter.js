'use strict';

/*!
 * mustache.js - Logic-less {{mustache}} templates with JavaScript
 * http://github.com/janl/mustache.js
 */

var objectToString = Object.prototype.toString;
var isArray = Array.isArray || function isArrayPolyfill (object) {
  return objectToString.call(object) === '[object Array]';
};

function isFunction (object) {
  return typeof object === 'function';
}

/**
 * More correct typeof string handling array
 * which normally returns typeof 'object'
 */
function typeStr (obj) {
  return isArray(obj) ? 'array' : typeof obj;
}

function escapeRegExp (string) {
  return string.replace(/[\-\[\]{}()*+?.,\\\^$|#\s]/g, '\\$&');
}

/**
 * Null safe way of checking whether or not an object,
 * including its prototype, has a given property
 */
function hasProperty (obj, propName) {
  return obj != null && typeof obj === 'object' && (propName in obj);
}

/**
 * Safe way of detecting whether or not the given thing is a primitive and
 * whether it has the given property
 */
function primitiveHasOwnProperty (primitive, propName) {
  return (
    primitive != null
    && typeof primitive !== 'object'
    && primitive.hasOwnProperty
    && primitive.hasOwnProperty(propName)
  );
}

// Workaround for https://issues.apache.org/jira/browse/COUCHDB-577
// See https://github.com/janl/mustache.js/issues/189
var regExpTest = RegExp.prototype.test;
function testRegExp (re, string) {
  return regExpTest.call(re, string);
}

var nonSpaceRe = /\S/;
function isWhitespace (string) {
  return !testRegExp(nonSpaceRe, string);
}

var entityMap = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#39;',
  '/': '&#x2F;',
  '`': '&#x60;',
  '=': '&#x3D;'
};

function escapeHtml (string) {
  return String(string).replace(/[&<>"'`=\/]/g, function fromEntityMap (s) {
    return entityMap[s];
  });
}

var whiteRe = /\s*/;
var spaceRe = /\s+/;
var equalsRe = /\s*=/;
var curlyRe = /\s*\}/;
var tagRe = /#|\^|\/|>|\{|&|=|!/;

/**
 * Breaks up the given `template` string into a tree of tokens. If the `tags`
 * argument is given here it must be an array with two string values: the
 * opening and closing tags used in the template (e.g. [ "<%", "%>" ]). Of
 * course, the default is to use mustaches (i.e. mustache.tags).
 *
 * A token is an array with at least 4 elements. The first element is the
 * mustache symbol that was used inside the tag, e.g. "#" or "&". If the tag
 * did not contain a symbol (i.e. {{myValue}}) this element is "name". For
 * all text that appears outside a symbol this element is "text".
 *
 * The second element of a token is its "value". For mustache tags this is
 * whatever else was inside the tag besides the opening symbol. For text tokens
 * this is the text itself.
 *
 * The third and fourth elements of the token are the start and end indices,
 * respectively, of the token in the original template.
 *
 * Tokens that are the root node of a subtree contain two more elements: 1) an
 * array of tokens in the subtree and 2) the index in the original template at
 * which the closing tag for that section begins.
 *
 * Tokens for partials also contain two more elements: 1) a string value of
 * indendation prior to that tag and 2) the index of that tag on that line -
 * eg a value of 2 indicates the partial is the third tag on this line.
 */
function parseTemplate (template, tags) {
  if (!template)
    return [];
  var lineHasNonSpace = false;
  var sections = [];     // Stack to hold section tokens
  var tokens = [];       // Buffer to hold the tokens
  var spaces = [];       // Indices of whitespace tokens on the current line
  var hasTag = false;    // Is there a {{tag}} on the current line?
  var nonSpace = false;  // Is there a non-space char on the current line?
  var indentation = '';  // Tracks indentation for tags that use it
  var tagIndex = 0;      // Stores a count of number of tags encountered on a line

  // Strips all whitespace tokens array for the current line
  // if there was a {{#tag}} on it and otherwise only space.
  function stripSpace () {
    if (hasTag && !nonSpace) {
      while (spaces.length)
        delete tokens[spaces.pop()];
    } else {
      spaces = [];
    }

    hasTag = false;
    nonSpace = false;
  }

  var openingTagRe, closingTagRe, closingCurlyRe;
  function compileTags (tagsToCompile) {
    if (typeof tagsToCompile === 'string')
      tagsToCompile = tagsToCompile.split(spaceRe, 2);

    if (!isArray(tagsToCompile) || tagsToCompile.length !== 2)
      throw new Error('Invalid tags: ' + tagsToCompile);

    openingTagRe = new RegExp(escapeRegExp(tagsToCompile[0]) + '\\s*');
    closingTagRe = new RegExp('\\s*' + escapeRegExp(tagsToCompile[1]));
    closingCurlyRe = new RegExp('\\s*' + escapeRegExp('}' + tagsToCompile[1]));
  }

  compileTags(tags || mustache.tags);

  var scanner = new Scanner(template);

  var start, type, value, chr, token, openSection;
  while (!scanner.eos()) {
    start = scanner.pos;

    // Match any text between tags.
    value = scanner.scanUntil(openingTagRe);

    if (value) {
      for (var i = 0, valueLength = value.length; i < valueLength; ++i) {
        chr = value.charAt(i);

        if (isWhitespace(chr)) {
          spaces.push(tokens.length);
          indentation += chr;
        } else {
          nonSpace = true;
          lineHasNonSpace = true;
          indentation += ' ';
        }

        tokens.push([ 'text', chr, start, start + 1 ]);
        start += 1;

        // Check for whitespace on the current line.
        if (chr === '\n') {
          stripSpace();
          indentation = '';
          tagIndex = 0;
          lineHasNonSpace = false;
        }
      }
    }

    // Match the opening tag.
    if (!scanner.scan(openingTagRe))
      break;

    hasTag = true;

    // Get the tag type.
    type = scanner.scan(tagRe) || 'name';
    scanner.scan(whiteRe);

    // Get the tag value.
    if (type === '=') {
      value = scanner.scanUntil(equalsRe);
      scanner.scan(equalsRe);
      scanner.scanUntil(closingTagRe);
    } else if (type === '{') {
      value = scanner.scanUntil(closingCurlyRe);
      scanner.scan(curlyRe);
      scanner.scanUntil(closingTagRe);
      type = '&';
    } else {
      value = scanner.scanUntil(closingTagRe);
    }

    // Match the closing tag.
    if (!scanner.scan(closingTagRe))
      throw new Error('Unclosed tag at ' + scanner.pos);

    if (type == '>') {
      token = [ type, value, start, scanner.pos, indentation, tagIndex, lineHasNonSpace ];
    } else {
      token = [ type, value, start, scanner.pos ];
    }
    tagIndex++;
    tokens.push(token);

    if (type === '#' || type === '^') {
      sections.push(token);
    } else if (type === '/') {
      // Check section nesting.
      openSection = sections.pop();

      if (!openSection)
        throw new Error('Unopened section "' + value + '" at ' + start);

      if (openSection[1] !== value)
        throw new Error('Unclosed section "' + openSection[1] + '" at ' + start);
    } else if (type === 'name' || type === '{' || type === '&') {
      nonSpace = true;
    } else if (type === '=') {
      // Set the tags for the next time around.
      compileTags(value);
    }
  }

  stripSpace();

  // Make sure there are no open sections when we're done.
  openSection = sections.pop();

  if (openSection)
    throw new Error('Unclosed section "' + openSection[1] + '" at ' + scanner.pos);

  return nestTokens(squashTokens(tokens));
}

/**
 * Combines the values of consecutive text tokens in the given `tokens` array
 * to a single token.
 */
function squashTokens (tokens) {
  var squashedTokens = [];

  var token, lastToken;
  for (var i = 0, numTokens = tokens.length; i < numTokens; ++i) {
    token = tokens[i];

    if (token) {
      if (token[0] === 'text' && lastToken && lastToken[0] === 'text') {
        lastToken[1] += token[1];
        lastToken[3] = token[3];
      } else {
        squashedTokens.push(token);
        lastToken = token;
      }
    }
  }

  return squashedTokens;
}

/**
 * Forms the given array of `tokens` into a nested tree structure where
 * tokens that represent a section have two additional items: 1) an array of
 * all tokens that appear in that section and 2) the index in the original
 * template that represents the end of that section.
 */
function nestTokens (tokens) {
  var nestedTokens = [];
  var collector = nestedTokens;
  var sections = [];

  var token, section;
  for (var i = 0, numTokens = tokens.length; i < numTokens; ++i) {
    token = tokens[i];

    switch (token[0]) {
      case '#':
      case '^':
        collector.push(token);
        sections.push(token);
        collector = token[4] = [];
        break;
      case '/':
        section = sections.pop();
        section[5] = token[2];
        collector = sections.length > 0 ? sections[sections.length - 1][4] : nestedTokens;
        break;
      default:
        collector.push(token);
    }
  }

  return nestedTokens;
}

/**
 * A simple string scanner that is used by the template parser to find
 * tokens in template strings.
 */
function Scanner (string) {
  this.string = string;
  this.tail = string;
  this.pos = 0;
}

/**
 * Returns `true` if the tail is empty (end of string).
 */
Scanner.prototype.eos = function eos () {
  return this.tail === '';
};

/**
 * Tries to match the given regular expression at the current position.
 * Returns the matched text if it can match, the empty string otherwise.
 */
Scanner.prototype.scan = function scan (re) {
  var match = this.tail.match(re);

  if (!match || match.index !== 0)
    return '';

  var string = match[0];

  this.tail = this.tail.substring(string.length);
  this.pos += string.length;

  return string;
};

/**
 * Skips all text until the given regular expression can be matched. Returns
 * the skipped string, which is the entire tail if no match can be made.
 */
Scanner.prototype.scanUntil = function scanUntil (re) {
  var index = this.tail.search(re), match;

  switch (index) {
    case -1:
      match = this.tail;
      this.tail = '';
      break;
    case 0:
      match = '';
      break;
    default:
      match = this.tail.substring(0, index);
      this.tail = this.tail.substring(index);
  }

  this.pos += match.length;

  return match;
};

/**
 * Represents a rendering context by wrapping a view object and
 * maintaining a reference to the parent context.
 */
function Context (view, parentContext) {
  this.view = view;
  this.cache = { '.': this.view };
  this.parent = parentContext;
}

/**
 * Creates a new context using the given view with this context
 * as the parent.
 */
Context.prototype.push = function push (view) {
  return new Context(view, this);
};

/**
 * Returns the value of the given name in this context, traversing
 * up the context hierarchy if the value is absent in this context's view.
 */
Context.prototype.lookup = function lookup (name) {
  var cache = this.cache;

  var value;
  if (cache.hasOwnProperty(name)) {
    value = cache[name];
  } else {
    var context = this, intermediateValue, names, index, lookupHit = false;

    while (context) {
      if (name.indexOf('.') > 0) {
        intermediateValue = context.view;
        names = name.split('.');
        index = 0;

        /**
         * Using the dot notion path in `name`, we descend through the
         * nested objects.
         *
         * To be certain that the lookup has been successful, we have to
         * check if the last object in the path actually has the property
         * we are looking for. We store the result in `lookupHit`.
         *
         * This is specially necessary for when the value has been set to
         * `undefined` and we want to avoid looking up parent contexts.
         *
         * In the case where dot notation is used, we consider the lookup
         * to be successful even if the last "object" in the path is
         * not actually an object but a primitive (e.g., a string, or an
         * integer), because it is sometimes useful to access a property
         * of an autoboxed primitive, such as the length of a string.
         **/
        while (intermediateValue != null && index < names.length) {
          if (index === names.length - 1)
            lookupHit = (
              hasProperty(intermediateValue, names[index])
              || primitiveHasOwnProperty(intermediateValue, names[index])
            );

          intermediateValue = intermediateValue[names[index++]];
        }
      } else {
        intermediateValue = context.view[name];

        /**
         * Only checking against `hasProperty`, which always returns `false` if
         * `context.view` is not an object. Deliberately omitting the check
         * against `primitiveHasOwnProperty` if dot notation is not used.
         *
         * Consider this example:
         * ```
         * Mustache.render("The length of a football field is {{#length}}{{length}}{{/length}}.", {length: "100 yards"})
         * ```
         *
         * If we were to check also against `primitiveHasOwnProperty`, as we do
         * in the dot notation case, then render call would return:
         *
         * "The length of a football field is 9."
         *
         * rather than the expected:
         *
         * "The length of a football field is 100 yards."
         **/
        lookupHit = hasProperty(context.view, name);
      }

      if (lookupHit) {
        value = intermediateValue;
        break;
      }

      context = context.parent;
    }

    cache[name] = value;
  }

  if (isFunction(value))
    value = value.call(this.view);

  return value;
};

/**
 * A Writer knows how to take a stream of tokens and render them to a
 * string, given a context. It also maintains a cache of templates to
 * avoid the need to parse the same template twice.
 */
function Writer () {
  this.templateCache = {
    _cache: {},
    set: function set (key, value) {
      this._cache[key] = value;
    },
    get: function get (key) {
      return this._cache[key];
    },
    clear: function clear () {
      this._cache = {};
    }
  };
}

/**
 * Clears all cached templates in this writer.
 */
Writer.prototype.clearCache = function clearCache () {
  if (typeof this.templateCache !== 'undefined') {
    this.templateCache.clear();
  }
};

/**
 * Parses and caches the given `template` according to the given `tags` or
 * `mustache.tags` if `tags` is omitted,  and returns the array of tokens
 * that is generated from the parse.
 */
Writer.prototype.parse = function parse (template, tags) {
  var cache = this.templateCache;
  var cacheKey = template + ':' + (tags || mustache.tags).join(':');
  var isCacheEnabled = typeof cache !== 'undefined';
  var tokens = isCacheEnabled ? cache.get(cacheKey) : undefined;

  if (tokens == undefined) {
    tokens = parseTemplate(template, tags);
    isCacheEnabled && cache.set(cacheKey, tokens);
  }
  return tokens;
};

/**
 * High-level method that is used to render the given `template` with
 * the given `view`.
 *
 * The optional `partials` argument may be an object that contains the
 * names and templates of partials that are used in the template. It may
 * also be a function that is used to load partial templates on the fly
 * that takes a single argument: the name of the partial.
 *
 * If the optional `config` argument is given here, then it should be an
 * object with a `tags` attribute or an `escape` attribute or both.
 * If an array is passed, then it will be interpreted the same way as
 * a `tags` attribute on a `config` object.
 *
 * The `tags` attribute of a `config` object must be an array with two
 * string values: the opening and closing tags used in the template (e.g.
 * [ "<%", "%>" ]). The default is to mustache.tags.
 *
 * The `escape` attribute of a `config` object must be a function which
 * accepts a string as input and outputs a safely escaped string.
 * If an `escape` function is not provided, then an HTML-safe string
 * escaping function is used as the default.
 */
Writer.prototype.render = function render (template, view, partials, config) {
  var tags = this.getConfigTags(config);
  var tokens = this.parse(template, tags);
  var context = (view instanceof Context) ? view : new Context(view, undefined);
  return this.renderTokens(tokens, context, partials, template, config);
};

/**
 * Low-level method that renders the given array of `tokens` using
 * the given `context` and `partials`.
 *
 * Note: The `originalTemplate` is only ever used to extract the portion
 * of the original template that was contained in a higher-order section.
 * If the template doesn't use higher-order sections, this argument may
 * be omitted.
 */
Writer.prototype.renderTokens = function renderTokens (tokens, context, partials, originalTemplate, config) {
  var buffer = '';

  var token, symbol, value;
  for (var i = 0, numTokens = tokens.length; i < numTokens; ++i) {
    value = undefined;
    token = tokens[i];
    symbol = token[0];

    if (symbol === '#') value = this.renderSection(token, context, partials, originalTemplate, config);
    else if (symbol === '^') value = this.renderInverted(token, context, partials, originalTemplate, config);
    else if (symbol === '>') value = this.renderPartial(token, context, partials, config);
    else if (symbol === '&') value = this.unescapedValue(token, context);
    else if (symbol === 'name') value = this.escapedValue(token, context, config);
    else if (symbol === 'text') value = this.rawValue(token);

    if (value !== undefined)
      buffer += value;
  }

  return buffer;
};

Writer.prototype.renderSection = function renderSection (token, context, partials, originalTemplate, config) {
  var self = this;
  var buffer = '';
  var value = context.lookup(token[1]);

  // This function is used to render an arbitrary template
  // in the current context by higher-order sections.
  function subRender (template) {
    return self.render(template, context, partials, config);
  }

  if (!value) return;

  if (isArray(value)) {
    for (var j = 0, valueLength = value.length; j < valueLength; ++j) {
      buffer += this.renderTokens(token[4], context.push(value[j]), partials, originalTemplate, config);
    }
  } else if (typeof value === 'object' || typeof value === 'string' || typeof value === 'number') {
    buffer += this.renderTokens(token[4], context.push(value), partials, originalTemplate, config);
  } else if (isFunction(value)) {
    if (typeof originalTemplate !== 'string')
      throw new Error('Cannot use higher-order sections without the original template');

    // Extract the portion of the original template that the section contains.
    value = value.call(context.view, originalTemplate.slice(token[3], token[5]), subRender);

    if (value != null)
      buffer += value;
  } else {
    buffer += this.renderTokens(token[4], context, partials, originalTemplate, config);
  }
  return buffer;
};

Writer.prototype.renderInverted = function renderInverted (token, context, partials, originalTemplate, config) {
  var value = context.lookup(token[1]);

  // Use JavaScript's definition of falsy. Include empty arrays.
  // See https://github.com/janl/mustache.js/issues/186
  if (!value || (isArray(value) && value.length === 0))
    return this.renderTokens(token[4], context, partials, originalTemplate, config);
};

Writer.prototype.indentPartial = function indentPartial (partial, indentation, lineHasNonSpace) {
  var filteredIndentation = indentation.replace(/[^ \t]/g, '');
  var partialByNl = partial.split('\n');
  for (var i = 0; i < partialByNl.length; i++) {
    if (partialByNl[i].length && (i > 0 || !lineHasNonSpace)) {
      partialByNl[i] = filteredIndentation + partialByNl[i];
    }
  }
  return partialByNl.join('\n');
};

Writer.prototype.renderPartial = function renderPartial (token, context, partials, config) {
  if (!partials) return;
  var tags = this.getConfigTags(config);

  var value = isFunction(partials) ? partials(token[1]) : partials[token[1]];
  if (value != null) {
    var lineHasNonSpace = token[6];
    var tagIndex = token[5];
    var indentation = token[4];
    var indentedValue = value;
    if (tagIndex == 0 && indentation) {
      indentedValue = this.indentPartial(value, indentation, lineHasNonSpace);
    }
    var tokens = this.parse(indentedValue, tags);
    return this.renderTokens(tokens, context, partials, indentedValue, config);
  }
};

Writer.prototype.unescapedValue = function unescapedValue (token, context) {
  var value = context.lookup(token[1]);
  if (value != null)
    return value;
};

Writer.prototype.escapedValue = function escapedValue (token, context, config) {
  var escape = this.getConfigEscape(config) || mustache.escape;
  var value = context.lookup(token[1]);
  if (value != null)
    return (typeof value === 'number' && escape === mustache.escape) ? String(value) : escape(value);
};

Writer.prototype.rawValue = function rawValue (token) {
  return token[1];
};

Writer.prototype.getConfigTags = function getConfigTags (config) {
  if (isArray(config)) {
    return config;
  }
  else if (config && typeof config === 'object') {
    return config.tags;
  }
  else {
    return undefined;
  }
};

Writer.prototype.getConfigEscape = function getConfigEscape (config) {
  if (config && typeof config === 'object' && !isArray(config)) {
    return config.escape;
  }
  else {
    return undefined;
  }
};

var mustache = {
  name: 'mustache.js',
  version: '4.2.0',
  tags: [ '{{', '}}' ],
  clearCache: undefined,
  escape: undefined,
  parse: undefined,
  render: undefined,
  Scanner: undefined,
  Context: undefined,
  Writer: undefined,
  /**
   * Allows a user to override the default caching strategy, by providing an
   * object with set, get and clear methods. This can also be used to disable
   * the cache by setting it to the literal `undefined`.
   */
  set templateCache (cache) {
    defaultWriter.templateCache = cache;
  },
  /**
   * Gets the default or overridden caching object from the default writer.
   */
  get templateCache () {
    return defaultWriter.templateCache;
  }
};

// All high-level mustache.* functions use this writer.
var defaultWriter = new Writer();

/**
 * Clears all cached templates in the default writer.
 */
mustache.clearCache = function clearCache () {
  return defaultWriter.clearCache();
};

/**
 * Parses and caches the given template in the default writer and returns the
 * array of tokens it contains. Doing this ahead of time avoids the need to
 * parse templates on the fly as they are rendered.
 */
mustache.parse = function parse (template, tags) {
  return defaultWriter.parse(template, tags);
};

/**
 * Renders the `template` with the given `view`, `partials`, and `config`
 * using the default writer.
 */
mustache.render = function render (template, view, partials, config) {
  if (typeof template !== 'string') {
    throw new TypeError('Invalid template! Template should be a "string" ' +
                        'but "' + typeStr(template) + '" was given as the first ' +
                        'argument for mustache#render(template, view, partials)');
  }

  return defaultWriter.render(template, view, partials, config);
};

// Export the escaping function so that the user may override it.
// See https://github.com/janl/mustache.js/issues/244
mustache.escape = escapeHtml;

// Export these mainly for testing, but also for advanced usage.
mustache.Scanner = Scanner;
mustache.Context = Context;
mustache.Writer = Writer;

var generic1 = "{{{attention}}}\n{{{house}}}\n{{{floor}}} {{{door}}}\n{{#first}} {{{road}}} || {{{place}}} || {{{hamlet}}} {{/first}} {{{house_number}}}\n{{{addition}}}\n{{{postcode}}} {{#first}} {{{postal_city}}} || {{{town}}} || {{{city}}} || {{{village}}} || {{{municipality}}} || {{{hamlet}}} || {{{county}}} || {{{state}}} || {{/first}}\n{{{archipelago}}}\n{{{state}}} {{{county}}}\n{{{country}}}\n{{{infos}}}\n";
var generic2 = "{{{attention}}}\n{{#first}} {{{house}}}, {{{quarter}}} || {{{house}}} {{/first}}\n{{{house_number}}} {{{road}}}\n{{{addition}}}\n{{#first}} {{{village}}} || {{{town}}} || {{{city}}} || {{{municipality}}} || {{{hamlet}}} || {{{county}}} || {{/first}} {{{postcode}}}\n{{#first}} {{{country}}} || {{{state}}} || {{/first}}\n";
var generic3 = "{{{attention}}}\n{{{house}}}\n{{{floor}}} {{{door}}}\n{{{house_number}}} {{{road}}}\n{{{addition}}}\n{{{place}}}\n{{{postcode}}} {{#first}} {{{town}}} || {{{village}}} || {{{hamlet}}} || {{{city}}} || {{{municipality}}} || {{{state}}} || {{/first}}\n{{{state}}} {{{county}}}\n{{{country}}}\n{{{infos}}}\n";
var generic4 = "{{{attention}}}\n{{{house}}}\n{{{floor}}} {{{door}}}\n{{{house_number}}} {{{road}}}\n{{{addition}}}\n{{#first}} {{{village}}} || {{{hamlet}}} {{/first}}\n{{#first}} {{{city}}} || {{{town}}} || {{{state_district}}} || {{{suburb}}} || {{{municipality}}} || {{{county}}} || {{/first}}, {{#first}} {{{state_code}}} || {{{state}}} || {{/first}} {{{postcode}}}\n{{{state}}} {{{county}}}\n{{{country}}}\n{{{infos}}}\n";
var generic5 = "{{{attention}}}\n{{{house}}}\n{{{floor}}} {{{door}}}\n{{{house_number}}} {{{road}}}\n{{{addition}}}\n{{#first}} {{{city}}} || {{{town}}} || {{{village}}} || {{{hamlet}}} {{/first}}\n{{#first}} {{{state_district}}} || {{{state}}} || {{/first}}\n{{{state}}} {{{county}}}\n{{{country}}}\n{{{infos}}}\n";
var generic6 = "{{{attention}}}\n{{{house}}}\n{{{floor}}} {{{door}}}\n{{{house_number}}} {{{road}}}\n{{{addition}}}\n{{#first}} {{{city}}} || {{{town}}} || {{{village}}} || {{{hamlet}}} || {{{municipality}}} {{/first}}\n{{{county}}}\n{{{state}}}\n{{{state}}} {{{county}}}\n{{{country}}}\n{{{infos}}}\n";
var generic7 = "{{{attention}}}\n{{{house}}}\n{{{floor}}} {{{door}}}\n{{{road}}} {{{house_number}}}\n{{{addition}}}\n{{#first}} {{{city}}} || {{{town}}} || {{{village}}} || {{{hamlet}}} {{{state}}}{{/first}}, {{{postcode}}}\n{{{state}}} {{{county}}}\n{{{country}}}\n{{{infos}}}\n";
var generic8 = "{{{attention}}}\n{{{house}}}\n{{{floor}}} {{{door}}}\n{{{road}}} {{{house_number}}}\n{{{addition}}}\n{{{postcode}}} {{#first}} {{{city}}} || {{{town}}} || {{{village}}} || {{{hamlet}}} || {{{municipality}}} {{/first}} {{#first}} {{{county_code}}} || {{{county}}} || {{/first}}\n{{{state}}} {{{county}}}\n{{{country}}}\n{{{infos}}}\n";
var generic9 = "{{{attention}}}\n{{{house}}}\n{{{floor}}} {{{door}}}\n{{{road}}} {{{house_number}}}\n{{{addition}}}\n{{#first}} {{{suburb}}} || {{{city_district}}} || {{{state_district}}} {{/first}}\n{{{postcode}}} {{#first}} {{{city}}} || {{{town}}} || {{{village}}} || {{{hamlet}}} || {{{state}}} || {{/first}}\n{{{state}}} {{{county}}}\n{{{country}}}\n{{{infos}}}\n";
var generic10 = "{{{attention}}}\n{{{house}}}\n{{{floor}}} {{{door}}}\n{{{road}}}, {{{house_number}}}\n{{{addition}}}\n{{#first}} {{{suburb}}} || {{{city_district}}} {{/first}}\n{{#first}} {{{city}}} || {{{town}}} || {{{village}}} || {{{hamlet}}} {{/first}}\n{{{state}}}\n{{{state}}} {{{county}}}\n{{{country}}}\n{{{infos}}}\n{{{postcode}}}\n";
var generic11 = "{{{country}}}\n{{{infos}}}\n{{{state}}}\n{{{postcode}}} {{#first}} {{{city}}} || {{{town}}} || {{{village}}} || {{{hamlet}}} {{/first}}\n{{{suburb}}}\n{{{road}}}, {{{house_number}}}\n{{{addition}}}\n{{{house}}}\n{{{floor}}} {{{door}}}\n{{{attention}}}\n";
var generic12 = "{{{attention}}}\n{{{house}}}\n{{{floor}}} {{{door}}}\n{{{house_number}}}, {{{road}}}\n{{{addition}}}\n{{#first}} {{{suburb}}} || {{{city_district}}} || {{{state_district}}} {{/first}}\n{{#first}} {{{city}}} || {{{town}}} || {{{village}}} || {{{hamlet}}} {{/first}} - {{{postcode}}}\n{{{state}}}\n{{{state}}} {{{county}}}\n{{{country}}}\n{{{infos}}}\n";
var generic13 = "{{{attention}}}\n{{{house}}}\n{{{floor}}} {{{door}}}\n{{{house_number}}} {{{road}}}\n{{{addition}}}\n{{#first}} {{{suburb}}} || {{{city_district}}} || {{{city}}} || {{{town}}} || {{{state_district}}} || {{{village}}} || {{{hamlet}}} || {{{region}}} {{/first}} {{#first}} {{{state_code}}} || {{{state}}} || {{/first}} {{{postcode}}}\n{{{state}}} {{{county}}}\n{{{country}}}\n{{{infos}}}\n";
var generic14 = "{{{attention}}}\n{{{house}}}\n{{{floor}}} {{{door}}}\n{{{house_number}}} {{{road}}}\n{{{addition}}}\n{{{postcode}}} {{#first}} {{{city}}} || {{{town}}} || {{{village}}} || {{{hamlet}}} || {{{state_district}}} {{/first}}\n{{{state}}}\n{{{state}}} {{{county}}}\n{{{country}}}\n{{{infos}}}\n";
var generic15 = "{{{attention}}}\n{{{house}}}\n{{{floor}}} {{{door}}}\n{{{road}}}, {{{house_number}}}\n{{{addition}}}\n{{{postcode}}} {{#first}} {{{city}}} || {{{town}}} || {{{village}}} || {{{hamlet}}} || {{{municipality}}} || {{{state}}} || {{{county}}} || {{/first}}\n{{{state}}} {{{county}}}\n{{{country}}}\n{{{infos}}}\n";
var generic16 = "{{{attention}}}\n{{{house}}}\n{{{floor}}} {{{door}}}\n{{{house_number}}} {{{road}}}\n{{{addition}}}\n{{#first}} {{{city}}} || {{{town}}} || {{{village}}} || {{{hamlet}}} || {{{municipality}}} || {{{county}}} || {{{state_district}}} || {{{state}}} || {{/first}}\n{{{state}}} {{{county}}}\n{{{country}}}\n{{{infos}}}\n";
var generic17 = "{{{attention}}}\n{{{house}}}\n{{{floor}}} {{{door}}}\n{{{road}}} {{{house_number}}}\n{{{addition}}}\n{{#first}} {{{city}}} || {{{town}}} || {{{village}}} || {{{hamlet}}} || {{{municipality}}} || {{{county}}} || {{{state_district}}} || {{{state}}} || {{/first}}\n{{{state}}} {{{county}}}\n{{{country}}}\n{{{infos}}}\n";
var generic18 = "{{{attention}}}\n{{{house}}}\n{{{floor}}} {{{door}}}\n{{{house_number}}}, {{{road}}}\n{{{addition}}}\n{{#first}} {{{city}}} || {{{town}}} || {{{village}}} || {{{hamlet}}} || {{{suburb}}} || {{{city_district}}} || {{{neighbourhood}}} || {{{state}}} || {{/first}}\n{{{state}}} {{{county}}}\n{{{country}}}\n{{{infos}}}\n";
var generic19 = "{{{attention}}}\n{{{house}}}\n{{{floor}}} {{{door}}}\n{{{road}}} {{{house_number}}}\n{{{addition}}}\n{{#first}} {{{suburb}}} || {{{city_district}}} || {{{neighbourhood}}} {{/first}}\n{{#first}} {{{city}}} || {{{town}}} || {{{village}}} || {{{hamlet}}} {{/first}} {{{postcode}}}\n{{{state}}} {{{county}}}\n{{{country}}}\n{{{infos}}}\n";
var generic20 = "{{{attention}}}\n{{{house}}}\n{{{floor}}} {{{door}}}\n{{{house_number}}} {{{road}}}\n{{{addition}}}\n{{#first}} {{{suburb}}} || {{{city_district}}} || {{{neighbourhood}}} {{/first}}\n{{#first}} {{{city}}} || {{{town}}} || {{{village}}} || {{{hamlet}}} {{/first}} {{{postcode}}}\n{{{state}}} {{{county}}}\n{{{country}}}\n{{{infos}}}\n";
var generic21 = "{{{attention}}}\n{{{house}}}\n{{{floor}}} {{{door}}}\n{{{road}}} {{{house_number}}}\n{{{addition}}}\n{{#first}} {{{suburb}}} || {{{city_district}}} || {{{neighbourhood}}} {{/first}}\n{{#first}} {{{city}}} || {{{town}}} || {{{village}}} || {{{hamlet}}} || {{{state}}} || {{/first}}\n{{{state}}} {{{county}}}\n{{{country}}}\n{{{infos}}}\n";
var generic22 = "{{{attention}}}\n{{{house}}}\n{{{floor}}} {{{door}}}\n{{{house_number}}}, {{{road}}}\n{{{addition}}}\n{{{postcode}}} {{#first}} {{{city}}} || {{{town}}} || {{{village}}} || {{{hamlet}}} || {{{state}}} || {{/first}}\n{{{state}}} {{{county}}}\n{{{country}}}\n{{{infos}}}\n";
var generic23 = "{{{attention}}}\n{{{house}}}\n{{{floor}}} {{{door}}}\n{{{house_number}}} {{{road}}}\n{{{addition}}}\n{{{quarter}}}\n{{#first}} {{{village}}} || {{{town}}} || {{{city}}} || {{{municipality}}} || {{{hamlet}}} || {{{county}}} || {{/first}}\n{{{postcode}}}\n{{#first}} {{{country}}} || {{{state}}} || {{/first}}\n";
var fallback1 = "{{{attention}}}\n{{{house}}}\n{{{floor}}} {{{door}}}\n{{{road}}} {{{house_number}}}\n{{{addition}}}\n{{{place}}}\n{{#first}} {{{suburb}}} || {{{city_district}}} || {{{neighbourhood}}} || {{{island}}} {{/first}}\n{{#first}} {{{city}}} || {{{town}}} || {{{village}}} || {{{hamlet}}} || {{{municipality}}} {{/first}}\n{{#first}} || {{{county}}} || {{{state_district}}} || {{{state}}} || {{{region}}} || {{{island}}}, {{{archipelago}}} {{/first}}\n{{{state}}} {{{county}}}\n{{{country}}}\n{{{infos}}}\n";
var fallback2 = "{{{attention}}}\n{{{house}}}\n{{{floor}}} {{{door}}}\n{{{road}}} {{{house_number}}}\n{{{addition}}}\n{{{place}}}\n{{#first}} {{{suburb}}} || {{{village}}} || {{{hamlet}}} {{/first}}\n{{#first}} {{{city}}} || {{{town}}} || {{{municipality}}} || {{{county}}} || {{{island}}} || {{{state_district}}} {{/first}}, {{#first}} || {{{state}}} || {{{state_code}}} {{/first}}\n{{{country}}}\n{{{infos}}}\n";
var fallback3 = "{{{attention}}}\n{{{house}}}\n{{{floor}}} {{{door}}}\n{{{road}}} {{{house_number}}}\n{{{addition}}}\n{{{place}}}\n{{#first}} {{{suburb}}} || {{{island}}} {{/first}}\n{{#first}} {{{village}}} || {{{hamlet}}} || {{{municipality}}} {{/first}}\n{{#first}} {{{town}}} || {{{city}}}{{/first}}\n{{{county}}}\n{{#first}} || {{{state}}} || {{{state_code}}} {{/first}}\n{{{state}}} {{{county}}}\n{{{country}}}\n{{{infos}}}\n";
var fallback4 = "{{{attention}}}\n{{{house}}}\n{{{floor}}} {{{door}}}\n{{{road}}} {{{house_number}}}\n{{{addition}}}\n{{{place}}}\n{{{suburb}}}\n{{#first}} {{{city}}} || {{{town}}} || {{{village}}} || {{{hamlet}}} || {{{municipality}}} || {{{county}}} || {{/first}}\n{{#first}} || {{{state}}} || {{{county}}} || {{/first}}\n{{{state}}} {{{county}}}\n{{{country}}}\n{{{infos}}}\n";
var AD$2 = {
	address_template: "{{{attention}}}\n{{{house}}}\n{{{floor}}} {{{door}}}\n{{{house_number}}} {{{road}}}\n{{{addition}}}\n{{{place}}}\n{{{postcode}}} {{#first}} {{{town}}} || {{{village}}} || {{{hamlet}}} || {{{city}}} || {{{municipality}}} || {{{state}}} || {{/first}}\n{{{state}}} {{{county}}}\n{{{country}}}\n{{{infos}}}\n"
};
var AE$3 = {
	address_template: "{{{attention}}}\n{{{house}}}\n{{{floor}}} {{{door}}}\n{{{house_number}}} {{{road}}}\n{{{addition}}}\n{{#first}} {{{suburb}}} || {{{city_district}}} || {{{neighbourhood}}} {{/first}}\n{{#first}} {{{city}}} || {{{town}}} || {{{village}}} || {{{hamlet}}} {{/first}}\n{{#first}} {{{state_district}}} || {{{state}}} || {{/first}}\n{{{state}}} {{{county}}}\n{{{country}}}\n{{{infos}}}\n"
};
var AF$3 = {
	address_template: "{{{attention}}}\n{{{house}}}\n{{{floor}}} {{{door}}}\n{{{road}}} {{{house_number}}}\n{{{addition}}}\n{{#first}} {{{suburb}}} || {{{city_district}}} || {{{neighbourhood}}} {{/first}}\n{{#first}} {{{city}}} || {{{town}}} || {{{village}}} || {{{hamlet}}} || {{{state}}} || {{/first}}\n{{{state}}} {{{county}}}\n{{{country}}}\n{{{infos}}}\n"
};
var AG$2 = {
	address_template: "{{{attention}}}\n{{{house}}}\n{{{floor}}} {{{door}}}\n{{{house_number}}} {{{road}}}\n{{{addition}}}\n{{#first}} {{{city}}} || {{{town}}} || {{{village}}} || {{{hamlet}}} || {{{municipality}}} || {{{county}}} || {{{state_district}}} || {{{state}}} || {{/first}}\n{{{state}}} {{{county}}}\n{{{country}}}\n{{{infos}}}\n"
};
var AI$2 = {
	address_template: "{{{attention}}}\n{{{house}}}\n{{{floor}}} {{{door}}}\n{{{road}}} {{{house_number}}}\n{{{addition}}}\n{{#first}} {{{city}}} || {{{town}}} || {{{village}}} || {{{hamlet}}} {{/first}}\n{{{postcode}}} {{{country}}}\n{{{infos}}}\n"
};
var AL$2 = {
	address_template: "{{{attention}}}\n{{{house}}}\n{{{floor}}} {{{door}}}\n{{{road}}} {{{house_number}}}\n{{{addition}}}\n{{{postcode}}} {{#first}} {{{city}}} || {{{town}}} || {{{city_district}}} || {{{municipality}}} || {{{state_district}}} || {{{village}}} || {{{hamlet}}} {{/first}}\n{{{state}}} {{{county}}}\n{{{country}}}\n{{{infos}}}\n",
	postformat_replace: [
		[
			"\n(\\d{4}) ([^,]*)\n",
			"\n$1-$2\n"
		]
	]
};
var AM$3 = {
	address_template: "{{{attention}}}\n{{{house}}}\n{{{floor}}} {{{door}}}\n{{{house_number}}} {{{road}}}\n{{{addition}}}\n{{{postcode}}}\n{{#first}} {{{city}}} || {{{town}}} || {{{village}}} || {{{hamlet}}} {{/first}}\n{{#first}} {{{state_district}}} || {{{state}}} || {{/first}}\n{{{state}}} {{{county}}}\n{{{country}}}\n{{{infos}}}\n"
};
var AO$3 = {
	address_template: "{{{attention}}}\n{{{house}}}\n{{{floor}}} {{{door}}}\n{{{road}}} {{{house_number}}}\n{{{addition}}}\n{{#first}} {{{city}}} || {{{town}}} || {{{village}}} || {{{hamlet}}} {{{state}}}{{/first}}, {{{postcode}}}\n{{{state}}} {{{county}}}\n{{{country}}}\n{{{infos}}}\n"
};
var AQ$2 = {
	address_template: "{{{house}}}\n{{{floor}}} {{{door}}}\n{{#first}} {{{city}}} || {{{town}}} || {{{village}}} || {{{hamlet}}} {{/first}}\n{{#first}} {{{country}}} || {{{continent}}} {{/first}}\n",
	fallback_template: "{{{house}}}\n{{{floor}}} {{{door}}}\n{{#first}} {{{city}}} || {{{town}}} || {{{village}}} || {{{hamlet}}} {{/first}}\n{{#first}} {{{country}}} || {{{continent}}} {{/first}}\n"
};
var AR$3 = {
	address_template: "{{{attention}}}\n{{{house}}}\n{{{floor}}} {{{door}}}\n{{{road}}} {{{house_number}}}\n{{{addition}}}\n{{#first}} {{{suburb}}} || {{{city_district}}} || {{{state_district}}} {{/first}}\n{{{postcode}}} {{#first}} {{{city}}} || {{{town}}} || {{{village}}} || {{{hamlet}}} || {{{state}}} || {{/first}}\n{{{state}}} {{{county}}}\n{{{country}}}\n{{{infos}}}\n",
	replace: [
		[
			"^Autonomous City of ",
			""
		]
	],
	postformat_replace: [
		[
			"\n(\\w\\d{4})(\\w{3}) ",
			"\n$1 $2 "
		]
	]
};
var AS$2 = {
	use_country: "US",
	change_country: "United States of America",
	add_component: "state=American Samoa"
};
var AT$3 = {
	address_template: "{{{attention}}}\n{{{house}}}\n{{{floor}}} {{{door}}}\n{{#first}} {{{road}}} || {{{place}}} || {{{hamlet}}} {{/first}} {{{house_number}}}\n{{{addition}}}\n{{{postcode}}} {{#first}} {{{postal_city}}} || {{{town}}} || {{{city}}} || {{{village}}} || {{{municipality}}} || {{{hamlet}}} || {{{county}}} || {{{state}}} || {{/first}}\n{{{archipelago}}}\n{{{state}}} {{{county}}}\n{{{country}}}\n{{{infos}}}\n"
};
var AU$3 = {
	address_template: "{{{attention}}}\n{{{house}}}\n{{{floor}}} {{{door}}}\n{{{house_number}}} {{{road}}}\n{{{addition}}}\n{{#first}} {{{suburb}}} || {{{city_district}}} || {{{city}}} || {{{town}}} || {{{state_district}}} || {{{village}}} || {{{hamlet}}} || {{{region}}} {{/first}} {{#first}} {{{state_code}}} || {{{state}}} || {{/first}} {{{postcode}}}\n{{{state}}} {{{county}}}\n{{{country}}}\n{{{infos}}}\n"
};
var AW$2 = {
	address_template: "{{{attention}}}\n{{{house}}}\n{{{floor}}} {{{door}}}\n{{{road}}} {{{house_number}}}\n{{{addition}}}\n{{#first}} {{{city}}} || {{{town}}} || {{{village}}} || {{{hamlet}}} || {{{municipality}}} || {{{county}}} || {{{state_district}}} || {{{state}}} || {{/first}}\n{{{state}}} {{{county}}}\n{{{country}}}\n{{{infos}}}\n"
};
var AX$2 = {
	use_country: "FI",
	change_country: "Åland, Finland"
};
var AZ$3 = {
	address_template: "{{{attention}}}\n{{{house}}}\n{{{floor}}} {{{door}}}\n{{{house_number}}} {{{road}}}\n{{{addition}}}\n{{{place}}}\n{{{postcode}}} {{#first}} {{{town}}} || {{{village}}} || {{{hamlet}}} || {{{city}}} || {{{municipality}}} || {{{state}}} || {{/first}}\n{{{state}}} {{{county}}}\n{{{country}}}\n{{{infos}}}\n"
};
var BA$3 = {
	address_template: "{{{attention}}}\n{{{house}}}\n{{{floor}}} {{{door}}}\n{{#first}} {{{road}}} || {{{place}}} || {{{hamlet}}} {{/first}} {{{house_number}}}\n{{{addition}}}\n{{{postcode}}} {{#first}} {{{postal_city}}} || {{{town}}} || {{{city}}} || {{{village}}} || {{{municipality}}} || {{{hamlet}}} || {{{county}}} || {{{state}}} || {{/first}}\n{{{archipelago}}}\n{{{state}}} {{{county}}}\n{{{country}}}\n{{{infos}}}\n"
};
var BB$2 = {
	address_template: "{{{attention}}}\n{{{house}}}\n{{{floor}}} {{{door}}}\n{{{house_number}}} {{{road}}}\n{{{addition}}}\n{{#first}} {{{city}}} || {{{town}}} || {{{village}}} || {{{hamlet}}} || {{{municipality}}} || {{{county}}} || {{{state_district}}} || {{{state}}} || {{/first}}\n{{{state}}} {{{county}}}\n{{{country}}}\n{{{infos}}}\n"
};
var BD$3 = {
	address_template: "{{{attention}}}\n{{{house}}}\n{{{floor}}} {{{door}}}\n{{{house_number}}} {{{road}}}\n{{{addition}}}\n{{#first}} {{{suburb}}} || {{{city_district}}} || {{{state_district}}} {{/first}}\n{{#first}} {{{city}}} || {{{town}}} || {{{village}}} || {{{hamlet}}} {{/first}} - {{{postcode}}}\n{{{state}}} {{{county}}}\n{{{country}}}\n{{{infos}}}\n"
};
var BE$3 = {
	address_template: "{{{attention}}}\n{{{house}}}\n{{{floor}}} {{{door}}}\n{{{road}}} {{{house_number}}}\n{{{addition}}}\n{{{postcode}}} {{#first}} {{{postal_city}}} || {{{town}}} || {{{city}}} || {{{village}}} || {{{municipality}}} || {{{hamlet}}} || {{{county}}} || {{{state}}} || {{/first}}\n{{{archipelago}}}\n{{{state}}} {{{county}}}\n{{{country}}}\n{{{infos}}}\n"
};
var BF$3 = {
	address_template: "{{{attention}}}\n{{{house}}}\n{{{floor}}} {{{door}}}\n{{{house_number}}} {{{road}}}\n{{{addition}}}\n{{#first}} {{{city}}} || {{{town}}} || {{{village}}} || {{{hamlet}}} || {{{municipality}}} {{/first}}\n{{{county}}}\n{{{state}}}\n{{{state}}} {{{county}}}\n{{{country}}}\n{{{infos}}}\n"
};
var BG$2 = {
	address_template: "{{{attention}}}\n{{{house}}}\n{{{floor}}} {{{door}}}\n{{{road}}} {{{house_number}}}\n{{{addition}}}\n{{#first}} {{{suburb}}} || {{{city_district}}} || {{{neighbourhood}}} {{/first}}\n{{#first}} {{{city}}} || {{{town}}} || {{{village}}} || {{{hamlet}}} {{/first}} {{{postcode}}}\n{{{state}}} {{{county}}}\n{{{country}}}\n{{{infos}}}\n"
};
var BH$2 = {
	address_template: "{{{attention}}}\n{{#first}} {{{house}}}, {{{quarter}}} || {{{house}}} {{/first}}\n{{{house_number}}} {{{road}}}\n{{{addition}}}\n{{#first}} {{{village}}} || {{{town}}} || {{{city}}} || {{{municipality}}} || {{{hamlet}}} || {{{county}}} || {{/first}} {{{postcode}}}\n{{#first}} {{{country}}} || {{{state}}} || {{/first}}\n"
};
var BI$3 = {
	address_template: "{{{attention}}}\n{{{house}}}\n{{{floor}}} {{{door}}}\n{{{road}}} {{{house_number}}}\n{{{addition}}}\n{{#first}} {{{city}}} || {{{town}}} || {{{village}}} || {{{hamlet}}} || {{{municipality}}} || {{{county}}} || {{{state_district}}} || {{{state}}} || {{/first}}\n{{{state}}} {{{county}}}\n{{{country}}}\n{{{infos}}}\n"
};
var BJ$3 = {
	address_template: "{{{attention}}}\n{{{house}}}\n{{{floor}}} {{{door}}}\n{{{house_number}}}, {{{road}}}\n{{{addition}}}\n{{#first}} {{{city}}} || {{{town}}} || {{{village}}} || {{{hamlet}}} || {{{suburb}}} || {{{city_district}}} || {{{neighbourhood}}} || {{{state}}} || {{/first}}\n{{{state}}} {{{county}}}\n{{{country}}}\n{{{infos}}}\n"
};
var BL$2 = {
	use_country: "FR",
	change_country: "Saint-Barthélemy, France"
};
var BM$2 = {
	address_template: "{{{attention}}}\n{{#first}} {{{house}}}, {{{quarter}}} || {{{house}}} {{/first}}\n{{{house_number}}} {{{road}}}\n{{{addition}}}\n{{#first}} {{{village}}} || {{{town}}} || {{{city}}} || {{{municipality}}} || {{{hamlet}}} || {{{county}}} || {{/first}} {{{postcode}}}\n{{#first}} {{{country}}} || {{{state}}} || {{/first}}\n"
};
var BN$3 = {
	address_template: "{{{attention}}}\n{{{house}}}\n{{{floor}}} {{{door}}}\n{{{house_number}}}, {{{road}}}\n{{{addition}}}\n{{#first}} {{{city}}} || {{{town}}} || {{{village}}} || {{{hamlet}}} || {{{municipality}}} {{/first}}\n{{#first}} || {{{county}}} || {{{state_district}}} || {{{state}}} || {{/first}} {{{postcode}}}\n{{{state}}} {{{county}}}\n{{{country}}}\n{{{infos}}}\n"
};
var BO$3 = {
	address_template: "{{{attention}}}\n{{{house}}}\n{{{floor}}} {{{door}}}\n{{{road}}} {{{house_number}}}\n{{{addition}}}\n{{#first}} {{{city}}} || {{{town}}} || {{{village}}} || {{{hamlet}}} || {{{municipality}}} || {{{county}}} || {{{state_district}}} || {{{state}}} || {{/first}}\n{{{state}}} {{{county}}}\n{{{country}}}\n{{{infos}}}\n",
	replace: [
		[
			"^Municipio Nuestra Senora de ",
			""
		]
	]
};
var BQ$2 = {
	use_country: "NL",
	change_country: "Caribbean Netherlands"
};
var BR$3 = {
	address_template: "{{{attention}}}\n{{{house}}}\n{{{floor}}} {{{door}}}\n{{{road}}} {{{house_number}}}\n{{{addition}}}\n{{#first}} {{{suburb}}} || {{{city_district}}} || {{{village}}} || {{{hamlet}}}{{/first}}\n{{#first}} {{{city}}} || {{{town}}} || {{{state_district}}} {{/first}} - {{#first}} {{{state_code}}} || {{{state}}} || {{/first}}\n{{{postcode}}}\n{{{state}}} {{{county}}}\n{{{country}}}\n{{{infos}}}\n",
	postformat_replace: [
		[
			"\\b(\\d{5})(\\d{3})\\b",
			"$1-$2"
		]
	]
};
var BS$2 = {
	address_template: "{{{attention}}}\n{{{house}}}\n{{{floor}}} {{{door}}}\n{{{road}}} {{{house_number}}}\n{{{addition}}}\n{{#first}} {{{city}}} || {{{town}}} || {{{village}}} || {{{hamlet}}} || {{{municipality}}} {{/first}}\n{{{county}}}\n{{{state}}} {{{county}}}\n{{{country}}}\n{{{infos}}}\n"
};
var BT$2 = {
	address_template: "{{{attention}}}\n{{{house}}}\n{{{floor}}} {{{door}}}\n{{{road}}} {{{house_number}}}, {{{house}}}\n{{{floor}}} {{{door}}}\n{{#first}} {{{suburb}}} || {{{city_district}}} || {{{neighbourhood}}} {{/first}}\n{{#first}} {{{city}}} || {{{town}}} || {{{village}}} || {{{hamlet}}} || {{{state}}} || {{/first}} {{{postcode}}}\n{{{state}}} {{{county}}}\n{{{country}}}\n{{{infos}}}\n"
};
var BV$2 = {
	use_country: "NO",
	change_country: "Bouvet Island, Norway"
};
var BW$3 = {
	address_template: "{{{attention}}}\n{{{house}}}\n{{{floor}}} {{{door}}}\n{{{road}}} {{{house_number}}}\n{{{addition}}}\n{{#first}} {{{suburb}}} || {{{city_district}}} || {{{neighbourhood}}} {{/first}}\n{{#first}} {{{city}}} || {{{town}}} || {{{village}}} || {{{hamlet}}} {{/first}}\n{{{state}}} {{{county}}}\n{{{country}}}\n{{{infos}}}\n"
};
var BY$3 = {
	address_template: "{{{country}}}\n{{{infos}}}\n{{{state}}}\n{{{postcode}}} {{#first}} {{{city}}} || {{{town}}} || {{{village}}} || {{{hamlet}}} {{/first}}\n{{{suburb}}}\n{{{road}}}, {{{house_number}}}\n{{{addition}}}\n{{{house}}}\n{{{floor}}} {{{door}}}\n{{{attention}}}\n"
};
var BZ$3 = {
	address_template: "{{{attention}}}\n{{{house}}}\n{{{floor}}} {{{door}}}\n{{{house_number}}} {{{road}}}\n{{{addition}}}\n{{#first}} {{{city}}} || {{{town}}} || {{{village}}} || {{{hamlet}}} || {{{municipality}}} || {{{county}}} || {{{state_district}}} || {{{state}}} || {{/first}}\n{{{state}}} {{{county}}}\n{{{country}}}\n{{{infos}}}\n"
};
var CA$4 = {
	address_template: "{{{attention}}}\n{{{house}}}\n{{{floor}}} {{{door}}}\n{{#first}} {{{house_number}}} {{{road}}} || {{{suburb}}} {{/first}}\n{{#first}} {{{city}}} || {{{town}}} || {{{village}}} || {{{hamlet}}} || {{{county}}} || {{{state_district}}} {{/first}}, {{#first}} {{{state_code}}} || {{{state}}} || {{/first}} {{{postcode}}}\n{{{state}}} {{{county}}}\n{{{country}}}\n{{{infos}}}\n",
	fallback_template: "{{{attention}}}\n{{{house}}}\n{{{floor}}} {{{door}}}\n{{#first}} {{{house_number}}} {{{road}}} || {{{suburb}}} {{/first}}\n{{#first}} {{{city}}} || {{{town}}} || {{{village}}} || {{{hamlet}}} || {{{county}}} || {{{state_district}}} {{/first}}, {{#first}} {{{state_code}}} || {{{state}}} || {{/first}} {{{postcode}}}\n{{{state}}} {{{county}}}\n{{{country}}}\n{{{infos}}}\n",
	postformat_replace: [
		[
			" ([A-Za-z]{2}) ([A-Za-z]\\d[A-Za-z])(\\d[A-Za-z]\\d)\n",
			" $1 $2 $3\n"
		]
	]
};
var CA_en = {
	address_template: "{{{attention}}}\n{{{house}}}\n{{{floor}}} {{{door}}}\n{{#first}} {{{house_number}}} {{{road}}} || {{{suburb}}} {{/first}}\n{{#first}} {{{city}}} || {{{town}}} || {{{village}}} || {{{hamlet}}} || {{{county}}} || {{{state_district}}} {{/first}}, {{#first}} {{{state_code}}} || {{{state}}} || {{/first}} {{{postcode}}}\n{{{state}}} {{{county}}}\n{{{country}}}\n{{{infos}}}\n",
	fallback_template: "{{{attention}}}\n{{{house}}}\n{{{floor}}} {{{door}}}\n{{#first}} {{{house_number}}} {{{road}}} || {{{suburb}}} {{/first}}\n{{#first}} {{{city}}} || {{{town}}} || {{{village}}} || {{{hamlet}}} || {{{county}}} || {{{state_district}}} {{/first}}, {{#first}} {{{state_code}}} || {{{state}}} || {{/first}} {{{postcode}}}\n{{{state}}} {{{county}}}\n{{{country}}}\n{{{infos}}}\n",
	postformat_replace: [
		[
			" ([A-Za-z]{2}) ([A-Za-z]\\d[A-Za-z])(\\d[A-Za-z]\\d)\n",
			" $1 $2 $3\n"
		]
	]
};
var CA_fr = {
	address_template: "{{{attention}}}\n{{{house}}}\n{{{floor}}} {{{door}}}\n{{#first}} {{{house_number}}}, {{{road}}} || {{{suburb}}} {{/first}}\n{{#first}} {{{city}}} || {{{town}}} || {{{village}}} || {{{hamlet}}} || {{{county}}} || {{{state_district}}} {{/first}} {{#first}} ({{{state_code}}}) {{{state}}} {{/first}} {{{postcode}}}\n{{{state}}} {{{county}}}\n{{{country}}}\n{{{infos}}}\n",
	postformat_replace: [
		[
			" ([A-Za-z]{2}) ([A-Za-z]\\d[A-Za-z])(\\d[A-Za-z]\\d)\n",
			" $1 $2 $3\n"
		]
	]
};
var CC$2 = {
	use_country: "AU",
	change_country: "Australia"
};
var CD$3 = {
	address_template: "{{{attention}}}\n{{{house}}}\n{{{floor}}} {{{door}}}\n{{{house_number}}}, {{{road}}}\n{{{addition}}}\n{{#first}} {{{city}}} || {{{town}}} || {{{village}}} || {{{hamlet}}} || {{{suburb}}} || {{{city_district}}} || {{{neighbourhood}}} || {{{state}}} || {{/first}}\n{{{state}}} {{{county}}}\n{{{country}}}\n{{{infos}}}\n"
};
var CF$3 = {
	address_template: "{{{attention}}}\n{{{house}}}\n{{{floor}}} {{{door}}}\n{{{road}}} {{{house_number}}}\n{{{addition}}}\n{{#first}} {{{city}}} || {{{town}}} || {{{village}}} || {{{hamlet}}} || {{{municipality}}} || {{{county}}} || {{{state_district}}} || {{{state}}} || {{/first}}\n{{{state}}} {{{county}}}\n{{{country}}}\n{{{infos}}}\n"
};
var CG$2 = {
	address_template: "{{{attention}}}\n{{{house}}}\n{{{floor}}} {{{door}}}\n{{{house_number}}}, {{{road}}}\n{{{addition}}}\n{{#first}} {{{city}}} || {{{town}}} || {{{village}}} || {{{hamlet}}} || {{{suburb}}} || {{{city_district}}} || {{{neighbourhood}}} || {{{state}}} || {{/first}}\n{{{state}}} {{{county}}}\n{{{country}}}\n{{{infos}}}\n"
};
var CH$3 = {
	address_template: "{{{attention}}}\n{{{house}}}\n{{{floor}}} {{{door}}}\n{{{road}}} {{{house_number}}}\n{{{addition}}}\n{{{postcode}}} {{#first}} {{{postal_city}}} || {{{town}}} || {{{city}}} || {{{municipality}}} || {{{village}}} || {{{hamlet}}} || {{{county}}} || {{{state}}} || {{/first}}\n{{{state}}} {{{county}}}\n{{{country}}}\n{{{infos}}}\n",
	replace: [
		[
			"Verwaltungskreis",
			""
		],
		[
			"Verwaltungsregion",
			""
		],
		[
			" administrative district",
			""
		],
		[
			" administrative region",
			""
		]
	]
};
var CI$3 = {
	address_template: "{{{attention}}}\n{{{house}}}\n{{{floor}}} {{{door}}}\n{{{house_number}}} {{{road}}}\n{{{addition}}}\n{{#first}} {{{city}}} || {{{town}}} || {{{village}}} || {{{hamlet}}} || {{{municipality}}} || {{{county}}} || {{{state_district}}} || {{{state}}} || {{/first}}\n{{{state}}} {{{county}}}\n{{{country}}}\n{{{infos}}}\n"
};
var CK$2 = {
	address_template: "{{{attention}}}\n{{{house}}}\n{{{floor}}} {{{door}}}\n{{{house_number}}} {{{road}}}\n{{{addition}}}\n{{#first}} {{{city}}} || {{{town}}} || {{{village}}} || {{{hamlet}}} || {{{municipality}}} || {{{county}}} || {{{state_district}}} || {{{state}}} || {{/first}}\n{{{state}}} {{{county}}}\n{{{country}}}\n{{{infos}}}\n"
};
var CL$3 = {
	address_template: "{{{attention}}}\n{{{house}}}\n{{{floor}}} {{{door}}}\n{{{road}}} {{{house_number}}}\n{{{addition}}}\n{{{postcode}}} {{#first}} {{{postal_city}}} || {{{town}}} || {{{city}}} || {{{village}}} || {{{municipality}}} || {{{hamlet}}} || {{{county}}} || {{{state}}} || {{/first}}\n{{{region}}}\n{{{state}}} {{{county}}}\n{{{country}}}\n{{{infos}}}\n"
};
var CM$3 = {
	address_template: "{{{attention}}}\n{{{house}}}\n{{{floor}}} {{{door}}}\n{{{road}}} {{{house_number}}}\n{{{addition}}}\n{{#first}} {{{city}}} || {{{town}}} || {{{village}}} || {{{hamlet}}} || {{{municipality}}} || {{{county}}} || {{{state_district}}} || {{{state}}} || {{/first}}\n{{{state}}} {{{county}}}\n{{{country}}}\n{{{infos}}}\n"
};
var CN$2 = {
	address_template: "{{{postcode}}} {{{country}}}\n{{{infos}}}\n{{#first}} {{{state_code}}} || {{{state}}} || {{{state_district}}} || {{{region}}}{{/first}}\n{{{county}}}\n{{#first}}{{{city}}} || {{{town}}} || {{{municipality}}}|| {{{village}}}|| {{{hamlet}}}{{/first}}\n{{#first}} {{{suburb}}} || {{{city_district}}} || {{{neighbourhood}}} {{/first}}\n{{{road}}} {{{house_number}}}\n{{{addition}}}\n{{{house}}}\n{{{floor}}} {{{door}}}\n{{{attention}}}\n"
};
var CN_en = {
	address_template: "{{{attention}}}\n{{{house}}}\n{{{floor}}} {{{door}}}\n{{{house_number}}} {{{road}}}\n{{{addition}}}\n{{#first}} {{{suburb}}} || {{{city_district}}} || {{{neighbourhood}}} {{/first}}\n{{{county}}}\n{{#first}}{{{city}}} || {{{town}}} || {{{municipality}}}|| {{{village}}}|| {{{hamlet}}}{{/first}}\n{{#first}} {{{state_code}}} || {{{state}}} || {{{state_district}}} || {{{region}}}{{/first}}\n{{{state}}} {{{county}}}\n{{{country}}} {{{postcode}}}\n"
};
var CN_zh = {
	address_template: "{{{postcode}}} {{{country}}}\n{{{infos}}}\n{{#first}} {{{state_code}}} || {{{state}}} || {{{state_district}}} || {{{region}}}{{/first}}\n{{{county}}}\n{{#first}}{{{city}}} || {{{town}}} || {{{municipality}}}|| {{{village}}}|| {{{hamlet}}}{{/first}}\n{{#first}} {{{suburb}}} || {{{city_district}}} || {{{neighbourhood}}} {{/first}}\n{{{road}}} {{{house_number}}}\n{{{addition}}}\n{{{house}}}\n{{{floor}}} {{{door}}}\n{{{attention}}}\n"
};
var CO$3 = {
	address_template: "{{{attention}}}\n{{{house}}}\n{{{floor}}} {{{door}}}\n{{{road}}} {{{house_number}}}\n{{{addition}}}\n{{#first}} {{{suburb}}} || {{{city_district}}} || {{{neighbourhood}}} {{/first}}\n{{{postcode}}} {{#first}} {{{city}}} || {{{town}}} || {{{state_district}}} || {{{village}}} || {{{hamlet}}} {{/first}}, {{#first}} {{{state_code}}} || {{{state}}} || {{/first}}\n{{{state}}} {{{county}}}\n{{{country}}}\n{{{infos}}}\n",
	postformat_replace: [
		[
			"Localidad ",
			" "
		],
		[
			"Bogota, Bogota",
			"Bogota"
		],
		[
			"Bogota, Bogotá Distrito Capital",
			"Bogota"
		],
		[
			"Bogotá, Bogotá Distrito Capital",
			"Bogotá"
		]
	]
};
var CR$3 = {
	address_template: "{{{attention}}}\n{{{house}}}\n{{{floor}}} {{{door}}}\n{{{road}}} {{{house_number}}}\n{{{addition}}}\n{{{state}}}, {{#first}} {{{city}}} || {{{town}}} || {{{state_district}}} || {{{village}}} || {{{hamlet}}} {{/first}}, {{#first}} {{{suburb}}} || {{{city_district}}} || {{{neighbourhood}}} {{/first}}\n{{{postcode}}} {{{country}}}\n{{{infos}}}\n"
};
var CU$2 = {
	address_template: "{{{attention}}}\n{{{house}}}\n{{{floor}}} {{{door}}}\n{{{road}}} {{{house_number}}}\n{{{addition}}}\n{{#first}} {{{city}}} || {{{town}}} || {{{village}}} || {{{hamlet}}} {{{state}}}{{/first}}, {{{postcode}}}\n{{{state}}} {{{county}}}\n{{{country}}}\n{{{infos}}}\n"
};
var CV$3 = {
	address_template: "{{{attention}}}\n{{{house}}}\n{{{floor}}} {{{door}}}\n{{#first}} {{{road}}} || {{{place}}} || {{{hamlet}}} {{/first}} {{{house_number}}}\n{{{addition}}}\n{{{postcode}}} {{#first}} {{{postal_city}}} || {{{town}}} || {{{city}}} || {{{village}}} || {{{municipality}}} || {{{hamlet}}} || {{{county}}} || {{{state}}} || {{/first}}\n{{{archipelago}}}\n{{{state}}} {{{county}}}\n{{{country}}}\n{{{infos}}}\n",
	postformat_replace: [
		[
			"\n(\\d{4}) ([^,]*)\n",
			"\n$1-$2\n"
		]
	]
};
var CW$2 = {
	address_template: "{{{attention}}}\n{{{house}}}\n{{{floor}}} {{{door}}}\n{{{road}}} {{{house_number}}}\n{{{addition}}}\n{{#first}} {{{city}}} || {{{town}}} || {{{village}}} || {{{hamlet}}} || {{{municipality}}} || {{{county}}} || {{{state_district}}} || {{{state}}} || {{/first}}\n{{{state}}} {{{county}}}\n{{{country}}}\n{{{infos}}}\n"
};
var CX$2 = {
	use_country: "AU",
	add_component: "state=Christmas Island",
	change_country: "Australia"
};
var CY$2 = {
	address_template: "{{{attention}}}\n{{{house}}}\n{{{floor}}} {{{door}}}\n{{#first}} {{{road}}} || {{{place}}} || {{{hamlet}}} {{/first}} {{{house_number}}}\n{{{addition}}}\n{{{postcode}}} {{#first}} {{{postal_city}}} || {{{town}}} || {{{city}}} || {{{village}}} || {{{municipality}}} || {{{hamlet}}} || {{{county}}} || {{{state}}} || {{/first}}\n{{{archipelago}}}\n{{{state}}} {{{county}}}\n{{{country}}}\n{{{infos}}}\n"
};
var CZ$2 = {
	address_template: "{{{attention}}}\n{{{house}}}\n{{{floor}}} {{{door}}}\n{{#first}} {{{road}}} || {{{place}}} || {{{hamlet}}} {{/first}} {{{house_number}}}\n{{{addition}}}\n{{{postcode}}} {{#first}} {{{postal_city}}} || {{{town}}} || {{{city}}} || {{{village}}} || {{{municipality}}} || {{{hamlet}}} || {{{county}}} || {{{state}}} || {{/first}}\n{{{archipelago}}}\n{{{state}}} {{{county}}}\n{{{country}}}\n{{{infos}}}\n",
	replace: [
		[
			"^Capital City of ",
			""
		]
	],
	postformat_replace: [
		[
			"\n(\\d{3})(\\d{2}) ",
			"\n$1 $2 "
		]
	]
};
var DE$4 = {
	address_template: "{{{attention}}}\n{{{house}}}\n{{{floor}}} {{{door}}}\n{{#first}} {{{road}}} || {{{place}}} || {{{hamlet}}} {{/first}} {{{house_number}}}\n{{{addition}}}\n{{{postcode}}} {{#first}} {{{village}}} {{{postal_city}}} || {{{town}}} || {{{city}}} || {{{municipality}}} || {{{hamlet}}} || {{{county}}} || {{{state}}} || {{/first}}\n{{{archipelago}}}\n{{{state}}} {{{county}}}\n{{{country}}}\n{{{infos}}}\n",
	fallback_template: "{{{attention}}}\n{{{house}}}\n{{{floor}}} {{{door}}}\n{{#first}} {{{road}}} || {{{place}}} || {{{hamlet}}} {{/first}} {{{house_number}}}\n{{{addition}}}\n{{#first}} {{{suburb}}} || {{{city_district}}} || {{{neighbourhood}}} {{/first}}\n{{#first}} {{{town}}} || {{{city}}} || {{{village}}} || {{{hamlet}}} || {{{municipality}}} || {{{county}}} || {{/first}}\n{{#first}} || {{{state}}} || {{{state_district}}} {{/first}}\n{{{state}}} {{{county}}}\n{{{country}}}\n{{{infos}}}\n",
	replace: [
		[
			"^Stadtteil ",
			""
		],
		[
			"^Stadtbezirk (\\d+)",
			""
		],
		[
			"^Ortsbeirat (\\d+) :",
			""
		],
		[
			"^Gemeinde ",
			""
		],
		[
			"^Gemeindeverwaltungsverband ",
			""
		],
		[
			"^Landkreis ",
			""
		],
		[
			"^Kreis ",
			""
		],
		[
			"^Grenze ",
			""
		],
		[
			"^Free State of ",
			""
		],
		[
			"^Freistaat ",
			""
		],
		[
			"^Regierungsbezirk ",
			""
		],
		[
			"^Stadtgebiet ",
			""
		],
		[
			"^Gemeindefreies Gebiet ",
			""
		],
		[
			"city=Alt-Berlin",
			"Berlin"
		]
	],
	postformat_replace: [
		[
			"Berlin\nBerlin",
			"Berlin"
		],
		[
			"Bremen\nBremen",
			"Bremen"
		],
		[
			"Hamburg\nHamburg",
			"Hamburg"
		]
	]
};
var DJ$3 = {
	address_template: "{{{attention}}}\n{{{house}}}\n{{{floor}}} {{{door}}}\n{{{house_number}}} {{{road}}}\n{{{addition}}}\n{{#first}} {{{city}}} || {{{town}}} || {{{village}}} || {{{hamlet}}} || {{{municipality}}} || {{{county}}} || {{{state_district}}} || {{{state}}} || {{/first}}\n{{{state}}} {{{county}}}\n{{{country}}}\n{{{infos}}}\n",
	replace: [
		[
			"city=Djibouti",
			"Djibouti-Ville"
		]
	]
};
var DK$2 = {
	address_template: "{{{attention}}}\n{{{house}}}\n{{{floor}}} {{{door}}}\n{{#first}} {{{road}}} || {{{place}}} || {{{hamlet}}} {{/first}} {{{house_number}}}\n{{{addition}}}\n{{{postcode}}} {{#first}} {{{postal_city}}} || {{{town}}} || {{{city}}} || {{{village}}} || {{{municipality}}} || {{{hamlet}}} || {{{county}}} || {{{state}}} || {{/first}}\n{{{archipelago}}}\n{{{state}}} {{{county}}}\n{{{country}}}\n{{{infos}}}\n",
	replace: [
		[
			"^Capital Region of ",
			""
		]
	]
};
var DM$2 = {
	address_template: "{{{attention}}}\n{{{house}}}\n{{{floor}}} {{{door}}}\n{{{house_number}}} {{{road}}}\n{{{addition}}}\n{{#first}} {{{city}}} || {{{town}}} || {{{village}}} || {{{hamlet}}} || {{{municipality}}} || {{{county}}} || {{{state_district}}} || {{{state}}} || {{/first}}\n{{{state}}} {{{county}}}\n{{{country}}}\n{{{infos}}}\n"
};
var DO$2 = {
	address_template: "{{{attention}}}\n{{{house}}}\n{{{floor}}} {{{door}}}\n{{{road}}} {{{house_number}}}\n{{{addition}}}\n{{#first}} {{{suburb}}} || {{{city_district}}} || {{{neighbourhood}}} {{/first}}\n{{#first}} {{{city}}} || {{{town}}} || {{{village}}} || {{{hamlet}}} {{/first}}, {{{state}}}\n{{{postcode}}}\n{{{state}}} {{{county}}}\n{{{country}}}\n{{{infos}}}\n",
	postformat_replace: [
		[
			", Distrito Nacional",
			", DN"
		]
	]
};
var DZ$2 = {
	address_template: "{{{attention}}}\n{{{house}}}\n{{{floor}}} {{{door}}}\n{{{house_number}}} {{{road}}}\n{{{addition}}}\n{{{place}}}\n{{{postcode}}} {{#first}} {{{town}}} || {{{village}}} || {{{hamlet}}} || {{{city}}} || {{{municipality}}} || {{{state}}} || {{/first}}\n{{{state}}} {{{county}}}\n{{{country}}}\n{{{infos}}}\n"
};
var EC$3 = {
	address_template: "{{{attention}}}\n{{{house}}}\n{{{floor}}} {{{door}}}\n{{{road}}} {{{house_number}}}\n{{{addition}}}\n{{{postcode}}}\n{{#first}} {{{city}}} || {{{town}}} || {{{state_district}}} || {{{village}}} || {{{hamlet}}} {{/first}}\n{{{state}}} {{{county}}}\n{{{country}}}\n{{{infos}}}\n"
};
var EG$2 = {
	address_template: "{{{attention}}}\n{{{house}}}\n{{{floor}}} {{{door}}}\n{{{house_number}}} {{{road}}}\n{{{addition}}}\n{{#first}} {{{suburb}}} || {{{city_district}}} || {{{neighbourhood}}} {{/first}}\n{{#first}} {{{city}}} || {{{town}}} || {{{village}}} || {{{hamlet}}} {{/first}}\n{{{postcode}}}\n{{{state}}} {{{county}}}\n{{{country}}}\n{{{infos}}}\n"
};
var EE$2 = {
	address_template: "{{{attention}}}\n{{{house}}}\n{{{floor}}} {{{door}}}\n{{#first}} {{{road}}} || {{{place}}} || {{{hamlet}}} {{/first}} {{{house_number}}}\n{{{addition}}}\n{{{postcode}}} {{#first}} {{{postal_city}}} || {{{town}}} || {{{city}}} || {{{village}}} || {{{municipality}}} || {{{hamlet}}} || {{{county}}} || {{{state}}} || {{/first}}\n{{{archipelago}}}\n{{{state}}} {{{county}}}\n{{{country}}}\n{{{infos}}}\n"
};
var EH$2 = {
	address_template: "{{{attention}}}\n{{{house}}}\n{{{floor}}} {{{door}}}\n{{{road}}} {{{house_number}}}\n{{{addition}}}\n{{#first}} {{{city}}} || {{{town}}} || {{{village}}} || {{{hamlet}}} || {{{municipality}}} || {{{county}}} || {{{state_district}}} || {{{state}}} || {{/first}}\n{{{state}}} {{{county}}}\n{{{country}}}\n{{{infos}}}\n"
};
var ER$3 = {
	address_template: "{{{attention}}}\n{{{house}}}\n{{{floor}}} {{{door}}}\n{{{road}}} {{{house_number}}}\n{{{addition}}}\n{{#first}} {{{city}}} || {{{town}}} || {{{village}}} || {{{hamlet}}} || {{{municipality}}} || {{{county}}} || {{{state_district}}} || {{{state}}} || {{/first}}\n{{{state}}} {{{county}}}\n{{{country}}}\n{{{infos}}}\n"
};
var ES$5 = {
	address_template: "{{{attention}}}\n{{{house}}}\n{{{floor}}} {{{door}}}\n{{{road}}}, {{{house_number}}}\n{{{addition}}}\n{{{postcode}}} {{#first}} {{{city}}} || {{{town}}} || {{{village}}} || {{{hamlet}}} || {{{municipality}}} || {{{state}}} || {{{county}}} || {{/first}}\n{{{state}}} {{{county}}}\n{{{country}}}\n{{{infos}}}\n",
	fallback_template: "{{{attention}}}\n{{{house}}}\n{{{floor}}} {{{door}}}\n{{{road}}} {{{house_number}}}\n{{{addition}}}\n{{{place}}}\n{{{suburb}}}\n{{#first}} {{{city}}} || {{{town}}} || {{{village}}} || {{{hamlet}}} || {{{municipality}}} || {{{county}}} || {{/first}}\n{{#first}} || {{{state}}} || {{{county}}} || {{/first}}\n{{{state}}} {{{county}}}\n{{{country}}}\n{{{infos}}}\n",
	replace: [
		[
			"Autonomous Community of the",
			""
		],
		[
			"Autonomous Community of",
			""
		],
		[
			"^Community of ",
			""
		]
	]
};
var ET$3 = {
	address_template: "{{{attention}}}\n{{{house}}}\n{{{floor}}} {{{door}}}\n{{#first}} {{{road}}} || {{{place}}} || {{{hamlet}}} {{/first}} {{{house_number}}}\n{{{addition}}}\n{{{postcode}}} {{#first}} {{{postal_city}}} || {{{town}}} || {{{city}}} || {{{village}}} || {{{municipality}}} || {{{hamlet}}} || {{{county}}} || {{{state}}} || {{/first}}\n{{{archipelago}}}\n{{{state}}} {{{county}}}\n{{{country}}}\n{{{infos}}}\n"
};
var FI$3 = {
	address_template: "{{{attention}}}\n{{{house}}}\n{{{floor}}} {{{door}}}\n{{#first}} {{{road}}} || {{{place}}} || {{{hamlet}}} {{/first}} {{{house_number}}}\n{{{addition}}}\n{{{postcode}}} {{#first}} {{{postal_city}}} || {{{town}}} || {{{city}}} || {{{village}}} || {{{municipality}}} || {{{hamlet}}} || {{{county}}} || {{{state}}} || {{/first}}\n{{{archipelago}}}\n{{{state}}} {{{county}}}\n{{{country}}}\n{{{infos}}}\n"
};
var FJ$3 = {
	address_template: "{{{attention}}}\n{{{house}}}\n{{{floor}}} {{{door}}}\n{{{house_number}}} {{{road}}}\n{{{addition}}}\n{{#first}} {{{city}}} || {{{town}}} || {{{village}}} || {{{hamlet}}} || {{{municipality}}} || {{{county}}} || {{{state_district}}} || {{{state}}} || {{/first}}\n{{{state}}} {{{county}}}\n{{{country}}}\n{{{infos}}}\n"
};
var FK$2 = {
	use_country: "GB",
	change_country: "Falkland Islands, United Kingdom"
};
var FM$3 = {
	use_country: "US",
	change_country: "United States of America",
	add_component: "state=Micronesia"
};
var FO$2 = {
	address_template: "{{{attention}}}\n{{{house}}}\n{{{floor}}} {{{door}}}\n{{#first}} {{{road}}} || {{{place}}} || {{{hamlet}}} {{/first}} {{{house_number}}}\n{{{addition}}}\n{{{postcode}}} {{#first}} {{{postal_city}}} || {{{town}}} || {{{city}}} || {{{village}}} || {{{municipality}}} || {{{hamlet}}} || {{{county}}} || {{{state}}} || {{/first}}\n{{{archipelago}}}\n{{{state}}} {{{county}}}\n{{{country}}}\n{{{infos}}}\n",
	postformat_replace: [
		[
			"Territorial waters of Faroe Islands",
			"Faroe Islands"
		]
	]
};
var FR$4 = {
	address_template: "{{{attention}}}\n{{{house}}}\n{{{floor}}} {{{door}}}\n{{{house_number}}} {{{road}}}\n{{{addition}}}\n{{{place}}}\n{{{postcode}}} {{#first}} {{{town}}} || {{{village}}} || {{{hamlet}}} || {{{city}}} || {{{municipality}}} || {{{state}}} || {{/first}}\n{{{state}}} {{{county}}}\n{{{country}}}\n{{{infos}}}\n",
	replace: [
		[
			"Polynésie française, Îles du Vent \\(eaux territoriales\\)",
			"Polynésie française"
		],
		[
			"France, Mayotte \\(eaux territoriales\\)",
			"Mayotte, France"
		],
		[
			"France, La Réunion \\(eaux territoriales\\)",
			"La Réunion, France"
		],
		[
			"Grande Terre et récifs d'Entrecasteaux",
			""
		],
		[
			"France, Nouvelle-Calédonie",
			"Nouvelle-Calédonie, France"
		],
		[
			"\\(eaux territoriales\\)",
			""
		],
		[
			"state= \\(France\\)$",
			""
		],
		[
			"Paris (\\d+)(\\w+) Arrondissement$",
			"Paris"
		]
	]
};
var GA$2 = {
	address_template: "{{{attention}}}\n{{{house}}}\n{{{floor}}} {{{door}}}\n{{{house_number}}} {{{road}}}\n{{{addition}}}\n{{#first}} {{{suburb}}} || {{{city_district}}} || {{{neighbourhood}}} || {{{village}}} || {{{hamlet}}} {{/first}}\n{{#first}} {{{city}}} || {{{town}}} || {{{municipality}}} || {{{county}}} || {{{state_district}}} || {{{state}}} || {{/first}}\n{{{state}}} {{{county}}}\n{{{country}}}\n{{{infos}}}\n"
};
var GB$4 = {
	address_template: "{{{attention}}}\n{{{house}}}\n{{{floor}}} {{{door}}}\n{{{house_number}}} {{{road}}}\n{{{addition}}}\n{{{quarter}}}\n{{#first}} {{{village}}} || {{{town}}} || {{{city}}} || {{{municipality}}} || {{{hamlet}}} || {{{county}}} || {{/first}}\n{{{postcode}}}\n{{#first}} {{{country}}} || {{{state}}} || {{/first}}\n",
	fallback_template: "{{{attention}}}\n{{{house}}}\n{{{floor}}} {{{door}}}\n{{{road}}} {{{house_number}}}\n{{{addition}}}\n{{{place}}}\n{{#first}} {{{suburb}}} || {{{island}}} {{/first}}\n{{#first}} {{{village}}} || {{{hamlet}}} || {{{municipality}}} {{/first}}\n{{#first}} {{{town}}} || {{{city}}}{{/first}}\n{{{county}}}\n{{#first}} || {{{state}}} || {{{state_code}}} {{/first}}\n{{{state}}} {{{county}}}\n{{{country}}}\n{{{infos}}}\n",
	replace: [
		[
			"village= CP$",
			""
		],
		[
			"^Borough of ",
			""
		],
		[
			"^County( of)? ",
			""
		],
		[
			"^Parish of ",
			""
		],
		[
			"^Greater London",
			"London"
		],
		[
			"^London Borough of ",
			""
		],
		[
			"Royal Borough of ",
			""
		],
		[
			"County Borough of ",
			""
		]
	],
	postformat_replace: [
		[
			"London, London",
			"London"
		],
		[
			"London, Greater London",
			"London"
		],
		[
			"City of Westminster",
			"London"
		],
		[
			"City of Nottingham",
			"Nottingham"
		],
		[
			", United Kingdom$",
			"\nUnited Kingdom"
		],
		[
			"London\nEngland\nUnited Kingdom",
			"London\nUnited Kingdom"
		]
	]
};
var GD$2 = {
	address_template: "{{{attention}}}\n{{{house}}}\n{{{floor}}} {{{door}}}\n{{{road}}} {{{house_number}}}\n{{{addition}}}\n{{#first}} {{{city}}} || {{{town}}} || {{{village}}} || {{{hamlet}}} || {{{municipality}}} || {{{county}}} || {{{state_district}}} || {{{state}}} || {{/first}}\n{{{state}}} {{{county}}}\n{{{country}}}\n{{{infos}}}\n"
};
var GE$3 = {
	address_template: "{{{attention}}}\n{{{house}}}\n{{{floor}}} {{{door}}}\n{{#first}} {{{road}}} || {{{place}}} || {{{hamlet}}} {{/first}} {{{house_number}}}\n{{{addition}}}\n{{{postcode}}} {{#first}} {{{postal_city}}} || {{{town}}} || {{{city}}} || {{{village}}} || {{{municipality}}} || {{{hamlet}}} || {{{county}}} || {{{state}}} || {{/first}}\n{{{archipelago}}}\n{{{state}}} {{{county}}}\n{{{country}}}\n{{{infos}}}\n"
};
var GF$2 = {
	use_country: "FR",
	change_country: "France"
};
var GG$2 = {
	use_country: "GB",
	change_country: "Guernsey, Channel Islands"
};
var GH$3 = {
	address_template: "{{{attention}}}\n{{{house}}}\n{{{floor}}} {{{door}}}\n{{{house_number}}} {{{road}}}\n{{{addition}}}\n{{#first}} {{{city}}} || {{{town}}} || {{{village}}} || {{{hamlet}}} || {{{municipality}}} || {{{county}}} || {{{state_district}}} || {{{state}}} || {{/first}}\n{{{state}}} {{{county}}}\n{{{country}}}\n{{{infos}}}\n"
};
var GI$2 = {
	address_template: "{{{attention}}}\n{{{house}}}\n{{{floor}}} {{{door}}}\n{{{house_number}}} {{{road}}}\n{{{addition}}}\n{{#first}} {{{city}}} || {{{town}}} || {{{village}}} || {{{hamlet}}} || {{{municipality}}} || {{{county}}} || {{{state_district}}} || {{{state}}} || {{/first}}\n{{{state}}} {{{county}}}\n{{{country}}}\n{{{infos}}}\n"
};
var GL$4 = {
	address_template: "{{{attention}}}\n{{{house}}}\n{{{floor}}} {{{door}}}\n{{#first}} {{{road}}} || {{{place}}} || {{{hamlet}}} {{/first}} {{{house_number}}}\n{{{addition}}}\n{{{postcode}}} {{#first}} {{{postal_city}}} || {{{town}}} || {{{city}}} || {{{village}}} || {{{municipality}}} || {{{hamlet}}} || {{{county}}} || {{{state}}} || {{/first}}\n{{{archipelago}}}\n{{{state}}} {{{county}}}\n{{{country}}}\n{{{infos}}}\n"
};
var GM$3 = {
	address_template: "{{{attention}}}\n{{{house}}}\n{{{floor}}} {{{door}}}\n{{{house_number}}} {{{road}}}\n{{{addition}}}\n{{#first}} {{{city}}} || {{{town}}} || {{{village}}} || {{{hamlet}}} || {{{municipality}}} || {{{county}}} || {{{state_district}}} || {{{state}}} || {{/first}}\n{{{state}}} {{{county}}}\n{{{country}}}\n{{{infos}}}\n"
};
var GN$3 = {
	address_template: "{{{attention}}}\n{{{house}}}\n{{{floor}}} {{{door}}}\n{{{house_number}}} {{{road}}}\n{{{addition}}}\n{{{postcode}}} {{#first}} {{{city}}} || {{{town}}} || {{{village}}} || {{{hamlet}}} || {{{state_district}}} {{/first}}\n{{{state}}}\n{{{state}}} {{{county}}}\n{{{country}}}\n{{{infos}}}\n"
};
var GP$2 = {
	use_country: "FR",
	change_country: "Guadeloupe, France"
};
var GQ$3 = {
	address_template: "{{{attention}}}\n{{{house}}}\n{{{floor}}} {{{door}}}\n{{{road}}} {{{house_number}}}\n{{{addition}}}\n{{#first}} {{{city}}} || {{{town}}} || {{{village}}} || {{{hamlet}}} || {{{municipality}}} || {{{county}}} || {{{state_district}}} || {{{state}}} || {{/first}}\n{{{state}}} {{{county}}}\n{{{country}}}\n{{{infos}}}\n"
};
var GR$2 = {
	address_template: "{{{attention}}}\n{{{house}}}\n{{{floor}}} {{{door}}}\n{{#first}} {{{road}}} || {{{place}}} || {{{hamlet}}} {{/first}} {{{house_number}}}\n{{{addition}}}\n{{{postcode}}} {{#first}} {{{postal_city}}} || {{{town}}} || {{{city}}} || {{{village}}} || {{{municipality}}} || {{{hamlet}}} || {{{county}}} || {{{state}}} || {{/first}}\n{{{archipelago}}}\n{{{state}}} {{{county}}}\n{{{country}}}\n{{{infos}}}\n",
	replace: [
		[
			"Municipal Unit of ",
			""
		],
		[
			"Regional Unit of ",
			""
		]
	],
	postformat_replace: [
		[
			"\n(\\d{3})(\\d{2}) ",
			"\n$1 $2 "
		]
	]
};
var GS$2 = {
	use_country: "GB",
	change_country: "United Kingdom",
	add_component: "county=South Georgia"
};
var GT$3 = {
	address_template: "{{{attention}}}\n{{{house}}}\n{{{floor}}} {{{door}}}\n{{{road}}} {{{house_number}}}\n{{{addition}}}\n{{{postcode}}}-{{#first}} {{{city}}} || {{{town}}} || {{{village}}} || {{{hamlet}}} || {{{municipality}}} || {{{state}}} || {{/first}}\n{{{state}}} {{{county}}}\n{{{country}}}\n{{{infos}}}\n",
	postformat_replace: [
		[
			"\n(\\d{5})- ",
			"\n$1-"
		],
		[
			"\n -",
			"\n"
		]
	]
};
var GU$2 = {
	use_country: "US",
	change_country: "United States of America",
	add_component: "state=Guam"
};
var GW$3 = {
	address_template: "{{{attention}}}\n{{{house}}}\n{{{floor}}} {{{door}}}\n{{#first}} {{{road}}} || {{{place}}} || {{{hamlet}}} {{/first}} {{{house_number}}}\n{{{addition}}}\n{{{postcode}}} {{#first}} {{{postal_city}}} || {{{town}}} || {{{city}}} || {{{village}}} || {{{municipality}}} || {{{hamlet}}} || {{{county}}} || {{{state}}} || {{/first}}\n{{{archipelago}}}\n{{{state}}} {{{county}}}\n{{{country}}}\n{{{infos}}}\n"
};
var GY$3 = {
	address_template: "{{{attention}}}\n{{{house}}}\n{{{floor}}} {{{door}}}\n{{{house_number}}} {{{road}}}\n{{{addition}}}\n{{#first}} {{{city}}} || {{{town}}} || {{{village}}} || {{{hamlet}}} || {{{municipality}}} || {{{county}}} || {{{state_district}}} || {{{state}}} || {{/first}}\n{{{state}}} {{{county}}}\n{{{country}}}\n{{{infos}}}\n"
};
var HK$2 = {
	address_template: "{{{attention}}}\n{{{house}}}\n{{{floor}}} {{{door}}}\n{{{house_number}}} {{{road}}}\n{{{addition}}}\n{{{state_district}}}\n{{#first}} || {{{state}}} || {{{country}}} {{/first}}\n"
};
var HK_en = {
	address_template: "{{{attention}}}\n{{{house}}}\n{{{floor}}} {{{door}}}\n{{{house_number}}} {{{road}}}\n{{{addition}}}\n{{{state_district}}}\n{{{state}}}\n{{{state}}} {{{county}}}\n{{{country}}}\n{{{infos}}}\n"
};
var HK_zh = {
	address_template: "{{{country}}}\n{{{infos}}}\n{{{state}}}\n{{{state_district}}}\n{{{road}}}\n{{{addition}}}\n{{{house_number}}}\n{{{addition}}}\n{{{house}}}\n{{{floor}}} {{{door}}}\n{{{attention}}}\n"
};
var HM$2 = {
	use_country: "AU",
	change_country: "Australia",
	add_component: "state=Heard Island and McDonald Islands"
};
var HN$3 = {
	address_template: "{{{attention}}}\n{{{house}}}\n{{{floor}}} {{{door}}}\n{{#first}} {{{road}}} || {{{place}}} || {{{hamlet}}} {{/first}} {{{house_number}}}\n{{{addition}}}\n{{{postcode}}} {{#first}} {{{postal_city}}} || {{{town}}} || {{{city}}} || {{{village}}} || {{{municipality}}} || {{{hamlet}}} || {{{county}}} || {{{state}}} || {{/first}}\n{{{archipelago}}}\n{{{state}}} {{{county}}}\n{{{country}}}\n{{{infos}}}\n"
};
var HR$2 = {
	address_template: "{{{attention}}}\n{{{house}}}\n{{{floor}}} {{{door}}}\n{{#first}} {{{road}}} || {{{place}}} || {{{hamlet}}} {{/first}} {{{house_number}}}\n{{{addition}}}\n{{{postcode}}} {{#first}} {{{postal_city}}} || {{{town}}} || {{{city}}} || {{{village}}} || {{{municipality}}} || {{{hamlet}}} || {{{county}}} || {{{state}}} || {{/first}}\n{{{archipelago}}}\n{{{state}}} {{{county}}}\n{{{country}}}\n{{{infos}}}\n"
};
var HT$3 = {
	address_template: "{{{attention}}}\n{{{house}}}\n{{{floor}}} {{{door}}}\n{{#first}} {{{road}}} || {{{place}}} || {{{hamlet}}} {{/first}} {{{house_number}}}\n{{{addition}}}\n{{{postcode}}} {{#first}} {{{postal_city}}} || {{{town}}} || {{{city}}} || {{{village}}} || {{{municipality}}} || {{{hamlet}}} || {{{county}}} || {{{state}}} || {{/first}}\n{{{archipelago}}}\n{{{state}}} {{{county}}}\n{{{country}}}\n{{{infos}}}\n",
	postformat_replace: [
		[
			" Commune de",
			" "
		]
	]
};
var HU$4 = {
	address_template: "{{{attention}}}\n{{{postcode}}} {{#first}} {{{city}}} || {{{town}}} || {{{village}}} || {{{hamlet}}} {{/first}}\n{{{road}}} {{{house_number}}}.\n{{{state}}} {{{county}}}\n{{{country}}}\n{{{infos}}}\n"
};
var ID$3 = {
	address_template: "{{{attention}}}\n{{{house}}}\n{{{floor}}} {{{door}}}\n{{{road}}} {{{house_number}}}\n{{{addition}}}\n{{#first}} {{{suburb}}} || {{{city_district}}} || {{{neighbourhood}}} {{/first}}\n{{#first}} {{{city}}} || {{{town}}} || {{{village}}} || {{{hamlet}}} {{/first}} {{{postcode}}}\n{{{state}}}\n{{{state}}} {{{county}}}\n{{{country}}}\n{{{infos}}}\n"
};
var IE$4 = {
	address_template: "{{{attention}}}\n{{{house}}}\n{{{floor}}} {{{door}}}\n{{{house_number}}} {{{road}}}\n{{{addition}}}\n{{#first}} {{{suburb}}} || {{{city_district}}} || {{{neighbourhood}}} {{/first}}\n{{#first}} {{{city}}} || {{{town}}} || {{{village}}} || {{{hamlet}}} || {{{municipality}}} {{/first}}\n{{{county}}}\n{{{postcode}}}\n{{{state}}} {{{county}}}\n{{{country}}}\n{{{infos}}}\n",
	replace: [
		[
			" City$",
			""
		],
		[
			"The Municipal District of ",
			""
		],
		[
			"The Metropolitan District of ",
			""
		],
		[
			"Municipal District",
			""
		],
		[
			"Electoral Division",
			""
		]
	],
	postformat_replace: [
		[
			"Dublin\nCounty Dublin",
			"Dublin"
		],
		[
			"Dublin\nLeinster",
			"Dublin"
		],
		[
			"Galway\nCounty Galway",
			"Galway"
		],
		[
			"Kilkenny\nCounty Kilkenny",
			"Kilkenny"
		],
		[
			"Limerick\nCounty Limerick",
			"Limerick"
		],
		[
			"Tipperary\nCounty Tipperary",
			"Tipperary"
		],
		[
			"\n(([AC-FHKNPRTV-Y][0-9]{2}|D6W))[ -]?([0-9AC-FHKNPRTV-Y]{4})",
			"\n$1 $3"
		]
	]
};
var IL$2 = {
	address_template: "{{{attention}}}\n{{{house}}}\n{{{floor}}} {{{door}}}\n{{#first}} {{{road}}} || {{{place}}} || {{{hamlet}}} {{/first}} {{{house_number}}}\n{{{addition}}}\n{{{postcode}}} {{#first}} {{{postal_city}}} || {{{town}}} || {{{city}}} || {{{village}}} || {{{municipality}}} || {{{hamlet}}} || {{{county}}} || {{{state}}} || {{/first}}\n{{{archipelago}}}\n{{{state}}} {{{county}}}\n{{{country}}}\n{{{infos}}}\n"
};
var IM$2 = {
	use_country: "GB"
};
var IN$3 = {
	address_template: "{{{attention}}}\n{{{house}}}\n{{{floor}}} {{{door}}}\n{{{house_number}}}, {{{road}}}\n{{{addition}}}\n{{#first}} {{{suburb}}} || {{{city_district}}} || {{{state_district}}} {{/first}}\n{{#first}} {{{city}}} || {{{town}}} || {{{village}}} || {{{hamlet}}} {{/first}} - {{{postcode}}}\n{{{state}}}\n{{{state}}} {{{county}}}\n{{{country}}}\n{{{infos}}}\n"
};
var IO$2 = {
	use_country: "GB",
	change_country: "British Indian Ocean Territory, United Kingdom"
};
var IQ$2 = {
	address_template: "{{{attention}}}\n{{{house}}}\n{{{floor}}} {{{door}}}\n{{{house_number}}} {{#first}} {{{city_district}}} || {{{neighbourhood}}} || {{{suburb}}} {{/first}}\n{{{road}}}\n{{{addition}}}\n{{#first}} {{{city}}} || {{{town}}} || {{{state}}} || {{{village}}} || {{{hamlet}}} {{/first}}\n{{{postcode}}}\n{{{state}}} {{{county}}}\n{{{country}}}\n{{{infos}}}\n"
};
var IR$2 = {
	address_template: "{{{attention}}}\n{{{house}}}\n{{{floor}}} {{{door}}}\n{{#first}} {{{city}}} || {{{town}}} || {{{village}}} || {{{hamlet}}} {{/first}}\n{{#first}} {{{suburb}}} || {{{city_district}}} || {{{neighbourhood}}} {{/first}}\n{{{road}}}\n{{{addition}}}\n{{{house_number}}}\n{{{addition}}}\n{{#first}}{{{province}}} || {{{state}}} || {{{state_district}}}{{/first}}\n{{{postcode}}}\n{{{state}}} {{{county}}}\n{{{country}}}\n{{{infos}}}\n"
};
var IR_en = {
	address_template: "{{{attention}}}\n{{{house}}}\n{{{floor}}} {{{door}}}\n{{#first}} {{{city}}} || {{{town}}} || {{{village}}} || {{{hamlet}}} {{/first}}\n{{#first}} {{{suburb}}} || {{{city_district}}} || {{{neighbourhood}}} {{/first}}\n{{{road}}}\n{{{addition}}}\n{{{house_number}}}\n{{{addition}}}\n{{#first}}{{{state}}} {{{state_district}}}{{/first}}\n{{{postcode}}}\n{{{state}}} {{{county}}}\n{{{country}}}\n{{{infos}}}\n"
};
var IR_fa = {
	address_template: "{{{country}}}\n{{{infos}}}\n{{{state}}}\n{{{state_district}}}\n{{#first}} || {{{state}}} || {{{province}}} {{/first}}\n{{#first}} {{{city}}} || {{{town}}} || {{{village}}} || {{{hamlet}}} {{/first}}\n{{#first}} {{{suburb}}} || {{{city_district}}} || {{{neighbourhood}}} {{/first}}\n{{{road}}}\n{{{addition}}}\n{{{house_number}}}\n{{{addition}}}\n{{{house}}}\n{{{floor}}} {{{door}}}\n{{{attention}}}\n{{{postcode}}}\n"
};
var IS$2 = {
	address_template: "{{{attention}}}\n{{{house}}}\n{{{floor}}} {{{door}}}\n{{#first}} {{{road}}} || {{{place}}} || {{{hamlet}}} {{/first}} {{{house_number}}}\n{{{addition}}}\n{{{postcode}}} {{#first}} {{{postal_city}}} || {{{town}}} || {{{city}}} || {{{village}}} || {{{municipality}}} || {{{hamlet}}} || {{{county}}} || {{{state}}} || {{/first}}\n{{{archipelago}}}\n{{{state}}} {{{county}}}\n{{{country}}}\n{{{infos}}}\n"
};
var IT$5 = {
	address_template: "{{{attention}}}\n{{{house}}}\n{{{floor}}} {{{door}}}\n{{{road}}} {{{house_number}}}\n{{{addition}}}\n{{{postcode}}} {{#first}} {{{city}}} || {{{town}}} || {{{village}}} || {{{hamlet}}} || {{{municipality}}} {{/first}} {{#first}} {{{county_code}}} || {{{county}}} || {{/first}}\n{{{state}}} {{{county}}}\n{{{country}}}\n{{{infos}}}\n",
	replace: [
		[
			"Città metropolitana di ",
			""
		],
		[
			"Metropolitan City of ",
			""
		],
		[
			"^Provincia di ",
			""
		]
	],
	postformat_replace: [
		[
			"Vatican City\nVatican City$",
			"\nVatican City"
		],
		[
			"Città del Vaticano\nCittà del Vaticano$",
			"Città del Vaticano\n"
		]
	]
};
var JE$2 = {
	use_country: "GB",
	change_country: "Jersey, Channel Islands"
};
var JM$2 = {
	address_template: "{{{attention}}}\n{{{house}}}\n{{{floor}}} {{{door}}}\n{{{house_number}}} {{{road}}}\n{{{addition}}}\n{{#first}} {{{suburb}}} || {{{city_district}}} || {{{neighbourhood}}} {{/first}}\n{{#first}} {{{city}}} || {{{town}}} || {{{village}}} || {{{hamlet}}} {{/first}} {{{postcode}}}\n{{{state}}} {{{county}}}\n{{{country}}}\n{{{infos}}}\n"
};
var JO$3 = {
	address_template: "{{{attention}}}\n{{{house}}}\n{{{floor}}} {{{door}}}\n{{#first}} {{{road}}} || {{{place}}} || {{{hamlet}}} {{/first}} {{{house_number}}}\n{{{addition}}}\n{{{postcode}}} {{#first}} {{{postal_city}}} || {{{town}}} || {{{city}}} || {{{village}}} || {{{municipality}}} || {{{hamlet}}} || {{{county}}} || {{{state}}} || {{/first}}\n{{{archipelago}}}\n{{{state}}} {{{county}}}\n{{{country}}}\n{{{infos}}}\n"
};
var JP$2 = {
	address_template: "{{{attention}}}\n{{{house}}}\n{{{floor}}} {{{door}}}\n{{{house_number}}} {{{road}}}\n{{{addition}}}\n{{#first}} {{{suburb}}} || {{{city_district}}} || {{{neighbourhood}}} {{/first}}\n{{#first}} {{{city}}} || {{{town}}} || {{{village}}} || {{{hamlet}}} {{/first}}, {{#first}} || {{{state}}} || {{{state_district}}} {{/first}} {{{postcode}}}\n{{{county}}}\n{{{country}}}\n{{{infos}}}\n",
	postformat_replace: [
		[
			" (\\d{3})(\\d{4})\n",
			" $1-$2\n"
		]
	]
};
var JP_en = {
	address_template: "{{{attention}}}\n{{{house}}}\n{{{floor}}} {{{door}}}\n{{{house_number}}} {{{road}}}\n{{{addition}}}\n{{#first}} {{{suburb}}} || {{{city_district}}} || {{{neighbourhood}}} {{/first}}\n{{#first}} {{{city}}} || {{{town}}} || {{{village}}} || {{{hamlet}}} {{/first}}, {{#first}} || {{{state}}} || {{{state_district}}} {{/first}} {{{postcode}}}\n{{{county}}}\n{{{country}}}\n{{{infos}}}\n",
	postformat_replace: [
		[
			" (\\d{3})(\\d{4})\n",
			" $1-$2\n"
		]
	]
};
var JP_ja = {
	address_template: "{{{country}}}\n{{{infos}}}\n{{{postcode}}}\n{{#first}} || {{{state}}} || {{{state_district}}} {{/first}}\n{{#first}} {{{city}}} || {{{town}}} || {{{village}}} || {{{hamlet}}} {{/first}}\n{{#first}} {{{suburb}}} || {{{city_district}}} || {{{neighbourhood}}} {{/first}}\n{{{road}}}\n{{{addition}}}\n{{{house_number}}}\n{{{addition}}}\n{{{house}}}\n{{{floor}}} {{{door}}}\n{{{attention}}}\n",
	postformat_replace: [
		[
			" (\\d{3})(\\d{4})\n",
			" $1-$2\n"
		]
	]
};
var KE$2 = {
	address_template: "{{{attention}}}\n{{{house}}}\n{{{floor}}} {{{door}}}\n{{{house_number}}} {{{road}}}\n{{{addition}}}\n{{#first}} {{{city}}} || {{{town}}} || {{{state}}} || {{{village}}} || {{{hamlet}}} {{/first}}\n{{{postcode}}}\n{{{state}}} {{{county}}}\n{{{country}}}\n{{{infos}}}\n"
};
var KG$3 = {
	address_template: "{{{country}}}\n{{{infos}}}\n{{{state}}}\n{{{postcode}}} {{#first}} {{{city}}} || {{{town}}} || {{{village}}} || {{{hamlet}}} {{/first}}\n{{{suburb}}}\n{{{road}}}, {{{house_number}}}\n{{{addition}}}\n{{{house}}}\n{{{floor}}} {{{door}}}\n{{{attention}}}\n"
};
var KH$2 = {
	address_template: "{{{attention}}}\n{{{house}}}\n{{{floor}}} {{{door}}}\n{{{house_number}}} {{{road}}}\n{{{addition}}}\n{{#first}} {{{suburb}}} || {{{city_district}}} || {{{neighbourhood}}} {{/first}}\n{{#first}} {{{city}}} || {{{town}}} || {{{village}}} || {{{hamlet}}} {{/first}} {{{postcode}}}\n{{{state}}} {{{county}}}\n{{{country}}}\n{{{infos}}}\n"
};
var KI$3 = {
	address_template: "{{{attention}}}\n{{{house}}}\n{{{floor}}} {{{door}}}\n{{{road}}} {{{house_number}}}\n{{{addition}}}\n{{#first}} {{{city}}} || {{{town}}} || {{{village}}} || {{{hamlet}}} || {{{municipality}}} || {{{county}}} || {{{state_district}}} || {{{state}}} || {{/first}}\n{{{state}}} {{{county}}}\n{{{country}}}\n{{{infos}}}\n"
};
var KM$3 = {
	address_template: "{{{attention}}}\n{{{house}}}\n{{{floor}}} {{{door}}}\n{{{road}}} {{{house_number}}}\n{{{addition}}}\n{{#first}} {{{city}}} || {{{town}}} || {{{village}}} || {{{hamlet}}} {{/first}}\n{{#first}} {{{suburb}}} || {{{city_district}}} || {{{neighbourhood}}} {{/first}}\n{{{state}}} {{{county}}}\n{{{country}}}\n{{{infos}}}\n"
};
var KN$3 = {
	address_template: "{{{attention}}}\n{{{house}}}\n{{{floor}}} {{{door}}}\n{{{house_number}}} {{{road}}}\n{{{addition}}}\n{{#first}} {{{city}}} || {{{town}}} || {{{village}}} || {{{hamlet}}} {{/first}}, {{#first}} || {{{state}}} || {{{island}}} {{/first}}\n{{{county}}}\n{{{country}}}\n{{{infos}}}\n"
};
var KP$2 = {
	address_template: "{{{attention}}}\n{{{house}}}\n{{{floor}}} {{{door}}}\n{{{road}}} {{{house_number}}}\n{{{addition}}}\n{{#first}} {{{suburb}}} || {{{city_district}}} || {{{neighbourhood}}} {{/first}}\n{{#first}} {{{city}}} || {{{town}}} || {{{village}}} || {{{hamlet}}} || {{{state}}} || {{/first}}\n{{{state}}} {{{county}}}\n{{{country}}}\n{{{infos}}}\n"
};
var KR$2 = {
	address_template: "{{{country}}}\n{{{infos}}}\n{{{state}}}\n{{#first}} {{{city}}} || {{{town}}} || {{{village}}} || {{{hamlet}}} {{/first}}, {{#first}} {{{suburb}}} || {{{city_district}}} || {{{neighbourhood}}} {{/first}}, {{{road}}} {{{house_number}}}\n{{{addition}}}\n{{{attention}}}\n{{{postcode}}}\n"
};
var KR_en = {
	address_template: "{{{attention}}}\n{{{house}}}\n{{{floor}}} {{{door}}}\n{{{house_number}}} {{{road}}}\n{{{addition}}}\n{{#first}} {{{suburb}}} || {{{city_district}}} || {{{neighbourhood}}} {{/first}}, {{#first}} {{{city}}} || {{{town}}} || {{{village}}} || {{{hamlet}}} {{/first}} {{{postcode}}}\n{{{state}}}\n{{{state}}} {{{county}}}\n{{{country}}}\n{{{infos}}}\n"
};
var KR_ko = {
	address_template: "{{{country}}}\n{{{infos}}}\n{{{state}}}\n{{#first}} {{{city}}} || {{{town}}} || {{{village}}} || {{{hamlet}}} {{/first}}, {{#first}} {{{suburb}}} || {{{city_district}}} || {{{neighbourhood}}} {{/first}}, {{{road}}} {{{house_number}}}\n{{{addition}}}\n{{{attention}}}\n{{{postcode}}}\n"
};
var KW$3 = {
	address_template: "{{{attention}}}\n{{{house}}}\n{{{floor}}} {{{door}}}\n{{#first}} {{{suburb}}} || {{{city_district}}} || {{{neighbourhood}}} {{/first}}\n\n{{{road}}}\n{{{addition}}}\n{{{house_number}}} {{{house}}}\n{{{floor}}} {{{door}}}\n{{{postcode}}} {{#first}} {{{city}}} || {{{town}}} || {{{village}}} || {{{hamlet}}} {{/first}}\n{{{state}}} {{{county}}}\n{{{country}}}\n{{{infos}}}\n"
};
var KY$2 = {
	address_template: "{{{attention}}}\n{{#first}} {{{house}}}, {{{quarter}}} || {{{house}}} {{/first}}\n{{{house_number}}} {{{road}}}\n{{{addition}}}\n{{#first}} {{{village}}} || {{{town}}} || {{{city}}} || {{{municipality}}} || {{{hamlet}}} || {{{county}}} || {{/first}} {{{postcode}}}\n{{#first}} {{{country}}} || {{{state}}} || {{/first}}\n"
};
var KZ$3 = {
	address_template: "{{{country}}}\n{{{infos}}}\n{{{state}}}\n{{{postcode}}} {{#first}} {{{city}}} || {{{town}}} || {{{village}}} || {{{hamlet}}} {{/first}}\n{{{suburb}}}\n{{{road}}}, {{{house_number}}}\n{{{addition}}}\n{{{house}}}\n{{{floor}}} {{{door}}}\n{{{attention}}}\n"
};
var LA$3 = {
	address_template: "{{{attention}}}\n{{{house}}}\n{{{floor}}} {{{door}}}\n{{{house_number}}}, {{{road}}}\n{{{addition}}}\n{{{postcode}}} {{#first}} {{{city}}} || {{{town}}} || {{{village}}} || {{{hamlet}}} || {{{state}}} || {{/first}}\n{{{state}}} {{{county}}}\n{{{country}}}\n{{{infos}}}\n"
};
var LB$3 = {
	address_template: "{{{attention}}}\n{{#first}} {{{house}}}, {{{quarter}}} || {{{house}}} {{/first}}\n{{{house_number}}} {{{road}}}\n{{{addition}}}\n{{#first}} {{{village}}} || {{{town}}} || {{{city}}} || {{{municipality}}} || {{{hamlet}}} || {{{county}}} || {{/first}} {{{postcode}}}\n{{#first}} {{{country}}} || {{{state}}} || {{/first}}\n",
	postformat_replace: [
		[
			" (\\d{4}) (\\d{4})\n",
			" $1 $2\n"
		]
	]
};
var LC$2 = {
	address_template: "{{{attention}}}\n{{{house}}}\n{{{floor}}} {{{door}}}\n{{{road}}} {{{house_number}}}\n{{{addition}}}\n{{#first}} {{{city}}} || {{{town}}} || {{{village}}} || {{{hamlet}}} || {{{municipality}}} || {{{county}}} || {{{state_district}}} || {{{state}}} || {{/first}}\n{{{state}}} {{{county}}}\n{{{country}}}\n{{{infos}}}\n"
};
var LI$2 = {
	use_country: "CH"
};
var LK$2 = {
	address_template: "{{{attention}}}\n{{{house}}}\n{{{floor}}} {{{door}}}\n{{{house_number}}} {{{road}}}\n{{{addition}}}\n{{#first}} {{{suburb}}} || {{{city_district}}} || {{{neighbourhood}}} {{/first}}\n{{#first}} {{{city}}} || {{{town}}} || {{{village}}} || {{{hamlet}}} {{/first}} {{{postcode}}}\n{{{state}}} {{{county}}}\n{{{country}}}\n{{{infos}}}\n"
};
var LR$3 = {
	address_template: "{{{attention}}}\n{{{house}}}\n{{{floor}}} {{{door}}}\n{{#first}} {{{road}}} || {{{place}}} || {{{hamlet}}} {{/first}} {{{house_number}}}\n{{{addition}}}\n{{{postcode}}} {{#first}} {{{postal_city}}} || {{{town}}} || {{{city}}} || {{{village}}} || {{{municipality}}} || {{{hamlet}}} || {{{county}}} || {{{state}}} || {{/first}}\n{{{archipelago}}}\n{{{state}}} {{{county}}}\n{{{country}}}\n{{{infos}}}\n"
};
var LS$3 = {
	address_template: "{{{attention}}}\n{{#first}} {{{house}}}, {{{quarter}}} || {{{house}}} {{/first}}\n{{{house_number}}} {{{road}}}\n{{{addition}}}\n{{#first}} {{{village}}} || {{{town}}} || {{{city}}} || {{{municipality}}} || {{{hamlet}}} || {{{county}}} || {{/first}} {{{postcode}}}\n{{#first}} {{{country}}} || {{{state}}} || {{/first}}\n"
};
var LT$3 = {
	address_template: "{{{attention}}}\n{{{house}}}\n{{{floor}}} {{{door}}}\n{{#first}} {{{road}}} || {{{place}}} || {{{hamlet}}} {{/first}} {{{house_number}}}\n{{{addition}}}\n{{{postcode}}} {{#first}} {{{postal_city}}} || {{{town}}} || {{{city}}} || {{{village}}} || {{{municipality}}} || {{{hamlet}}} || {{{county}}} || {{{state}}} || {{/first}}\n{{{archipelago}}}\n{{{state}}} {{{county}}}\n{{{country}}}\n{{{infos}}}\n"
};
var LU$3 = {
	address_template: "{{{attention}}}\n{{{house}}}\n{{{floor}}} {{{door}}}\n{{{house_number}}} {{{road}}}\n{{{addition}}}\n{{{place}}}\n{{{postcode}}} {{#first}} {{{town}}} || {{{village}}} || {{{hamlet}}} || {{{city}}} || {{{municipality}}} || {{{state}}} || {{/first}}\n{{{state}}} {{{county}}}\n{{{country}}}\n{{{infos}}}\n"
};
var LV$2 = {
	address_template: "{{{attention}}}\n{{{house}}}\n{{{floor}}} {{{door}}}\n{{{road}}} {{{house_number}}}\n{{{addition}}}\n{{#first}} {{{city}}} || {{{town}}} || {{{village}}} || {{{hamlet}}} {{{state}}}{{/first}}, {{{postcode}}}\n{{{state}}} {{{county}}}\n{{{country}}}\n{{{infos}}}\n"
};
var LY$3 = {
	address_template: "{{{attention}}}\n{{{house}}}\n{{{floor}}} {{{door}}}\n{{{road}}} {{{house_number}}}\n{{{addition}}}\n{{#first}} {{{city}}} || {{{town}}} || {{{village}}} || {{{hamlet}}} || {{{municipality}}} || {{{county}}} || {{{state_district}}} || {{{state}}} || {{/first}}\n{{{state}}} {{{county}}}\n{{{country}}}\n{{{infos}}}\n"
};
var MA$2 = {
	address_template: "{{{attention}}}\n{{{house}}}\n{{{floor}}} {{{door}}}\n{{{house_number}}} {{{road}}}\n{{{addition}}}\n{{{place}}}\n{{{postcode}}} {{#first}} {{{town}}} || {{{village}}} || {{{hamlet}}} || {{{city}}} || {{{municipality}}} || {{{state}}} || {{/first}}\n{{{state}}} {{{county}}}\n{{{country}}}\n{{{infos}}}\n"
};
var MC$2 = {
	address_template: "{{{attention}}}\n{{{house}}}\n{{{floor}}} {{{door}}}\n{{{house_number}}} {{{road}}}\n{{{addition}}}\n{{{place}}}\n{{{postcode}}} {{#first}} {{{town}}} || {{{village}}} || {{{hamlet}}} || {{{city}}} || {{{municipality}}} || {{{state}}} || {{/first}}\n{{{state}}} {{{county}}}\n{{{country}}}\n{{{infos}}}\n"
};
var MD$3 = {
	address_template: "{{{attention}}}\n{{{house}}}\n{{{floor}}} {{{door}}}\n{{{road}}}, {{{house_number}}}\n{{{addition}}}\n{{{postcode}}} {{#first}} {{{city}}} || {{{town}}} || {{{village}}} || {{{hamlet}}} || {{{state}}} || {{/first}}\n{{{state}}} {{{county}}}\n{{{country}}}\n{{{infos}}}\n"
};
var ME$2 = {
	address_template: "{{{attention}}}\n{{{house}}}\n{{{floor}}} {{{door}}}\n{{#first}} {{{road}}} || {{{place}}} || {{{hamlet}}} {{/first}} {{{house_number}}}\n{{{addition}}}\n{{{postcode}}} {{#first}} {{{postal_city}}} || {{{town}}} || {{{city}}} || {{{village}}} || {{{municipality}}} || {{{hamlet}}} || {{{county}}} || {{{state}}} || {{/first}}\n{{{archipelago}}}\n{{{state}}} {{{county}}}\n{{{country}}}\n{{{infos}}}\n"
};
var MF$2 = {
	use_country: "FR",
	change_country: "France"
};
var MH$2 = {
	use_country: "US",
	add_component: "state=Marshall Islands"
};
var MG$3 = {
	address_template: "{{{attention}}}\n{{{house}}}\n{{{floor}}} {{{door}}}\n{{{house_number}}} {{{road}}}\n{{{addition}}}\n{{#first}} {{{suburb}}} || {{{city_district}}} || {{{neighbourhood}}} {{/first}}\n{{{postcode}}} {{#first}} {{{city}}} || {{{town}}} || {{{village}}} || {{{hamlet}}} {{/first}}\n{{{state}}} {{{county}}}\n{{{country}}}\n{{{infos}}}\n"
};
var MK$2 = {
	address_template: "{{{attention}}}\n{{{house}}}\n{{{floor}}} {{{door}}}\n{{#first}} {{{road}}} || {{{place}}} || {{{hamlet}}} {{/first}} {{{house_number}}}\n{{{addition}}}\n{{{postcode}}} {{#first}} {{{postal_city}}} || {{{town}}} || {{{city}}} || {{{village}}} || {{{municipality}}} || {{{hamlet}}} || {{{county}}} || {{{state}}} || {{/first}}\n{{{archipelago}}}\n{{{state}}} {{{county}}}\n{{{country}}}\n{{{infos}}}\n"
};
var ML$2 = {
	address_template: "{{{attention}}}\n{{{house}}}\n{{{floor}}} {{{door}}}\n{{{road}}} {{{house_number}}}\n{{{addition}}}\n{{#first}} {{{city}}} || {{{town}}} || {{{village}}} || {{{hamlet}}} || {{{municipality}}} || {{{county}}} || {{{state_district}}} || {{{state}}} || {{/first}}\n{{{state}}} {{{county}}}\n{{{country}}}\n{{{infos}}}\n"
};
var MM$2 = {
	address_template: "{{{attention}}}\n{{{house}}}\n{{{floor}}} {{{door}}}\n{{{house_number}}} {{{road}}}\n{{{addition}}}\n{{#first}} {{{city}}} || {{{town}}} || {{{village}}} || {{{hamlet}}} || {{{state}}} || {{/first}}, {{{postcode}}}\n{{{state}}} {{{county}}}\n{{{country}}}\n{{{infos}}}\n"
};
var MN$2 = {
	address_template: "{{{attention}}}\n{{{house}}}\n{{{floor}}} {{{door}}}\n{{{city_district}}}\n{{#first}} {{{suburb}}} || {{{neighbourhood}}} {{/first}}\n{{{road}}}\n{{{addition}}}\n{{{house_number}}}\n{{{addition}}}\n{{{postcode}}}\n{{#first}} {{{city}}} || {{{town}}} || {{{village}}} || {{{hamlet}}} {{/first}}\n{{{state}}} {{{county}}}\n{{{country}}}\n{{{infos}}}\n"
};
var MO$2 = {
	address_template: "{{{attention}}}\n{{{house}}}\n{{{floor}}} {{{door}}}\n{{{road}}} {{{house_number}}}\n{{{addition}}}\n{{#first}} {{{suburb}}} || {{{village}}} || {{{hamlet}}} || {{{state_district}}} {{/first}}\n{{{state}}} {{{county}}}\n{{{country}}}\n{{{infos}}}\n"
};
var MO_pt = {
	address_template: "{{{attention}}}\n{{{house}}}\n{{{floor}}} {{{door}}}\n{{{road}}} {{{house_number}}}\n{{{addition}}}\n{{#first}} {{{suburb}}} || {{{village}}} || {{{hamlet}}} || {{{state_district}}} {{/first}}\n{{{state}}} {{{county}}}\n{{{country}}}\n{{{infos}}}\n"
};
var MO_zh = {
	address_template: "{{{country}}}\n{{{infos}}}\n{{#first}} {{{suburb}}} || {{{village}}} || {{{hamlet}}} || {{{state_district}}} {{/first}}\n{{{road}}}\n{{{addition}}}\n{{{house_number}}}\n{{{addition}}}\n{{{house}}}\n{{{floor}}} {{{door}}}\n{{{attention}}}\n"
};
var MP$2 = {
	use_country: "US",
	change_country: "United States of America",
	add_component: "state=Northern Mariana Islands"
};
var MS$2 = {
	address_template: "{{{attention}}}\n{{{house}}}\n{{{floor}}} {{{door}}}\n{{{house_number}}} {{{road}}}\n{{{addition}}}\n{{#first}} {{{city}}} || {{{town}}} || {{{village}}} || {{{hamlet}}} || {{{municipality}}} || {{{county}}} || {{{state_district}}} || {{{state}}} || {{/first}}\n{{{state}}} {{{county}}}\n{{{country}}}\n{{{infos}}}\n"
};
var MT$2 = {
	address_template: "{{{attention}}}\n{{{house}}}\n{{{floor}}} {{{door}}}\n{{{house_number}}} {{{road}}}\n{{{addition}}}\n{{#first}} {{{city}}} || {{{town}}} || {{{suburb}}} || {{{village}}} || {{{hamlet}}} {{/first}}\n{{{postcode}}}\n{{{state}}} {{{county}}}\n{{{country}}}\n{{{infos}}}\n"
};
var MQ$2 = {
	use_country: "FR",
	change_country: "Martinique, France"
};
var MR$2 = {
	address_template: "{{{attention}}}\n{{{house}}}\n{{{floor}}} {{{door}}}\n{{{house_number}}}, {{{road}}}\n{{{addition}}}\n{{#first}} {{{city}}} || {{{town}}} || {{{village}}} || {{{hamlet}}} || {{{suburb}}} || {{{city_district}}} || {{{neighbourhood}}} || {{{state}}} || {{/first}}\n{{{state}}} {{{county}}}\n{{{country}}}\n{{{infos}}}\n"
};
var MU$3 = {
	address_template: "{{{attention}}}\n{{{house}}}\n{{{floor}}} {{{door}}}\n{{{house_number}}}, {{{road}}}\n{{{addition}}}\n{{#first}} {{{suburb}}} || {{{city_district}}} || {{{neighbourhood}}} {{/first}}\n{{#first}} {{{city}}} || {{{town}}} || {{{village}}} || {{{hamlet}}} || {{{state}}} || {{/first}} {{{postcode}}}\n{{{state}}} {{{county}}}\n{{{country}}}\n{{{infos}}}\n"
};
var MV$2 = {
	address_template: "{{{attention}}}\n{{#first}} {{{house}}}, {{{quarter}}} || {{{house}}} {{/first}}\n{{{house_number}}} {{{road}}}\n{{{addition}}}\n{{#first}} {{{village}}} || {{{town}}} || {{{city}}} || {{{municipality}}} || {{{hamlet}}} || {{{county}}} || {{/first}} {{{postcode}}}\n{{#first}} {{{country}}} || {{{state}}} || {{/first}}\n"
};
var MW$3 = {
	address_template: "{{{attention}}}\n{{{house}}}\n{{{floor}}} {{{door}}}\n{{{house_number}}} {{{road}}}\n{{{addition}}}\n{{#first}} {{{city}}} || {{{town}}} || {{{village}}} || {{{hamlet}}} || {{{municipality}}} || {{{county}}} || {{{state_district}}} || {{{state}}} || {{/first}}\n{{{state}}} {{{county}}}\n{{{country}}}\n{{{infos}}}\n"
};
var MX$3 = {
	address_template: "{{{attention}}}\n{{{house}}}\n{{{floor}}} {{{door}}}\n{{{road}}} {{{house_number}}}\n{{{addition}}}\n{{#first}} {{{suburb}}} || {{{city_district}}} || {{{neighbourhood}}} {{/first}}\n{{{postcode}}} {{#first}} {{{city}}} || {{{town}}} || {{{state_district}}} || {{{village}}} || {{{hamlet}}} {{/first}}, {{#first}} {{{state_code}}} || {{{state}}} || {{/first}}\n{{{state}}} {{{county}}}\n{{{country}}}\n{{{infos}}}\n"
};
var MY$3 = {
	address_template: "{{{attention}}}\n{{{house}}}\n{{{floor}}} {{{door}}}\n{{{house_number}}} {{{road}}}\n{{{addition}}}\n{{#first}} {{{suburb}}} || {{{city_district}}} || {{{neighbourhood}}} {{/first}}\n{{{postcode}}} {{#first}} {{{city}}} || {{{town}}} || {{{village}}} || {{{hamlet}}} {{/first}}\n{{{state}}}\n{{{state}}} {{{county}}}\n{{{country}}}\n{{{infos}}}\n"
};
var MZ$3 = {
	address_template: "{{{attention}}}\n{{{house}}}\n{{{floor}}} {{{door}}}\n{{{road}}}, {{{house_number}}}\n{{{addition}}}\n{{{postcode}}} {{#first}} {{{city}}} || {{{town}}} || {{{village}}} || {{{hamlet}}} || {{{municipality}}} || {{{state}}} || {{{county}}} || {{/first}}\n{{{state}}} {{{county}}}\n{{{country}}}\n{{{infos}}}\n",
	fallback_template: "{{{attention}}}\n{{{house}}}\n{{{floor}}} {{{door}}}\n{{{road}}} {{{house_number}}}\n{{{addition}}}\n{{{place}}}\n{{{suburb}}}\n{{#first}} {{{city}}} || {{{town}}} || {{{village}}} || {{{hamlet}}} || {{{municipality}}} || {{{county}}} || {{/first}}\n{{#first}} || {{{state}}} || {{{county}}} || {{/first}}\n{{{state}}} {{{county}}}\n{{{country}}}\n{{{infos}}}\n"
};
var NA$3 = {
	address_template: "{{{attention}}}\n{{#first}} {{{house}}}, {{{quarter}}} || {{{house}}} {{/first}}\n{{{house_number}}} {{{road}}}\n{{{addition}}}\n{{#first}} {{{village}}} || {{{town}}} || {{{city}}} || {{{municipality}}} || {{{hamlet}}} || {{{county}}} || {{/first}} {{{postcode}}}\n{{#first}} {{{country}}} || {{{state}}} || {{/first}}\n"
};
var NC$2 = {
	use_country: "FR",
	change_country: "Nouvelle-Calédonie, France"
};
var NE$2 = {
	address_template: "{{{attention}}}\n{{{house}}}\n{{{floor}}} {{{door}}}\n{{{house_number}}}\n{{{addition}}}\n{{{road}}}\n{{{addition}}}\n{{#first}} {{{city}}} || {{{town}}} || {{{village}}} || {{{hamlet}}} {{/first}}\n{{{state}}} {{{county}}}\n{{{country}}}\n{{{infos}}}\n"
};
var NF$2 = {
	use_country: "AU",
	add_component: "state=Norfolk Island",
	change_country: "Australia"
};
var NG$3 = {
	address_template: "{{{attention}}}\n{{{house}}}\n{{{floor}}} {{{door}}}\n{{{house_number}}} {{{road}}}\n{{{addition}}}\n{{#first}} {{{city}}} || {{{town}}} || {{{village}}} || {{{hamlet}}} {{/first}} {{{postcode}}}\n{{{state}}}\n{{{state}}} {{{county}}}\n{{{country}}}\n{{{infos}}}\n"
};
var NI$3 = {
	address_template: "{{{attention}}}\n{{{house}}}\n{{{floor}}} {{{door}}}\n{{{road}}} {{{house_number}}}\n{{{addition}}}\n{{#first}} {{{suburb}}} || {{{city_district}}} || {{{neighbourhood}}} {{/first}}\n{{#first}} {{{city}}} || {{{town}}} || {{{village}}} || {{{hamlet}}} || {{{state}}} || {{/first}}\n{{{state}}} {{{county}}}\n{{{country}}}\n{{{infos}}}\n"
};
var NL$4 = {
	address_template: "{{{attention}}}\n{{{house}}}\n{{{floor}}} {{{door}}}\n{{#first}} {{{road}}} || {{{place}}} || {{{hamlet}}} {{/first}} {{{house_number}}}\n{{{addition}}}\n{{{postcode}}} {{#first}} {{{postal_city}}} || {{{town}}} || {{{city}}} || {{{village}}} || {{{municipality}}} || {{{hamlet}}} || {{{county}}} || {{{state}}} || {{/first}}\n{{{archipelago}}}\n{{{state}}} {{{county}}}\n{{{country}}}\n{{{infos}}}\n",
	postformat_replace: [
		[
			"\n(\\d{4})(\\w{2}) ",
			"\n$1 $2 "
		],
		[
			"\nKoninkrijk der Nederlanden$",
			"\nNederland"
		]
	]
};
var NO$3 = {
	address_template: "{{{attention}}}\n{{{house}}}\n{{{floor}}} {{{door}}}\n{{#first}} {{{road}}} || {{{place}}} || {{{hamlet}}} {{/first}} {{{house_number}}}\n{{{addition}}}\n{{{postcode}}} {{#first}} {{{postal_city}}} || {{{town}}} || {{{city}}} || {{{village}}} || {{{municipality}}} || {{{hamlet}}} || {{{county}}} || {{{state}}} || {{/first}}\n{{{archipelago}}}\n{{{state}}} {{{county}}}\n{{{country}}}\n{{{infos}}}\n"
};
var NP$2 = {
	address_template: "{{{attention}}}\n{{{house}}}\n{{{floor}}} {{{door}}}\n{{{road}}} {{{house_number}}}\n{{{addition}}}\n{{#first}} {{{suburb}}} || {{{neighbourhood}}} || {{{city}}} {{/first}}\n{{#first}} {{{municipality}}} || {{{county}}} || {{{state_district}}} || {{{state}}} || {{/first}} {{{postcode}}}\n{{{state}}} {{{county}}}\n{{{country}}}\n{{{infos}}}\n"
};
var NR$2 = {
	address_template: "{{{attention}}}\n{{{house}}}\n{{{floor}}} {{{door}}}\n{{{house_number}}} {{{road}}}\n{{{addition}}}\n{{#first}} {{{city}}} || {{{town}}} || {{{village}}} || {{{hamlet}}} || {{{municipality}}} || {{{county}}} || {{{state_district}}} || {{{state}}} || {{/first}}\n{{{state}}} {{{county}}}\n{{{country}}}\n{{{infos}}}\n"
};
var NU$2 = {
	address_template: "{{{attention}}}\n{{{house}}}\n{{{floor}}} {{{door}}}\n{{{house_number}}} {{{road}}}\n{{{addition}}}\n{{#first}} {{{city}}} || {{{town}}} || {{{village}}} || {{{hamlet}}} || {{{municipality}}} || {{{county}}} || {{{state_district}}} || {{{state}}} || {{/first}}\n{{{state}}} {{{county}}}\n{{{country}}}\n{{{infos}}}\n"
};
var NZ$3 = {
	address_template: "{{{attention}}}\n{{{house}}}\n{{{floor}}} {{{door}}}\n{{{house_number}}} {{{road}}}\n{{{addition}}}\n{{#first}} {{{suburb}}} || {{{city_district}}} || {{{neighbourhood}}} {{/first}}\n{{#first}} {{{city}}} || {{{town}}} || {{{village}}} || {{{hamlet}}} {{/first}} {{{postcode}}}\n{{{state}}} {{{county}}}\n{{{country}}}\n{{{infos}}}\n",
	postformat_replace: [
		[
			"Wellington\nWellington City",
			"Wellington"
		]
	]
};
var OM$3 = {
	address_template: "{{{attention}}}\n{{{house}}}\n{{{floor}}} {{{door}}}\n{{{house_number}}} {{{road}}}\n{{{addition}}}\n{{{postcode}}}\n{{#first}} {{{city}}} || {{{town}}} || {{{state_district}}} || {{{village}}} || {{{hamlet}}} {{/first}}\n{{{state}}}\n{{{state}}} {{{county}}}\n{{{country}}}\n{{{infos}}}\n"
};
var PA$2 = {
	address_template: "{{{attention}}}\n{{{house}}}\n{{{floor}}} {{{door}}}\n{{{road}}} {{{house_number}}}\n{{{addition}}}\n{{#first}} {{{suburb}}} || {{{city_district}}} || {{{neighbourhood}}} {{/first}}\n{{{postcode}}}\n{{#first}} {{{city}}} || {{{town}}} || {{{state_district}}} || {{{village}}} || {{{hamlet}}} {{/first}}\n{{{state}}}\n{{{state}}} {{{county}}}\n{{{country}}}\n{{{infos}}}\n",
	replace: [
		[
			"city=Panama$",
			"Panama City"
		],
		[
			"city=Panamá$",
			"Ciudad de Panamá"
		]
	]
};
var PE$3 = {
	address_template: "{{{attention}}}\n{{{house}}}\n{{{floor}}} {{{door}}}\n{{{road}}} {{{house_number}}}\n{{{addition}}}\n{{#first}} {{{suburb}}} || {{{city_district}}} || {{{neighbourhood}}} {{/first}}\n{{#first}} {{{city}}} || {{{town}}} || {{{village}}} || {{{hamlet}}} {{/first}} {{{postcode}}}\n{{{state}}} {{{county}}}\n{{{country}}}\n{{{infos}}}\n"
};
var PF$2 = {
	use_country: "FR",
	change_country: "Polynésie française, France",
	replace: [
		[
			"Polynésie française, Îles du Vent \\(eaux territoriales\\)",
			"Polynésie française"
		]
	]
};
var PG$3 = {
	address_template: "{{{attention}}}\n{{{house}}}\n{{{floor}}} {{{door}}}\n{{{house_number}}} {{{road}}}\n{{{addition}}}\n{{#first}} {{{city}}} || {{{town}}} || {{{village}}} || {{{hamlet}}} {{/first}} {{{postcode}}} {{{state}}}\n{{{state}}} {{{county}}}\n{{{country}}}\n{{{infos}}}\n"
};
var PH$3 = {
	address_template: "{{{attention}}}\n{{{house}}}\n{{{floor}}} {{{door}}}\n{{{house_number}}} {{{road}}}, {{#first}}{{{suburb}}} || {{{city_district}}} || {{{neighbourhood}}}{{/first}}, {{#first}} {{{city}}} || {{{town}}} || {{{village}}} || {{{hamlet}}} || {{{suburb}}} || {{{state_district}}} {{/first}}\n{{{addition}}}\n{{{postcode}}} {{#first}} {{{municipality}}} {{{region}}} || {{{state}}} || {{/first}}\n{{{state}}} {{{county}}}\n{{{country}}}\n{{{infos}}}\n"
};
var PK$3 = {
	address_template: "{{{attention}}}\n{{{house}}}\n{{{floor}}} {{{door}}}\n{{{house_number}}} {{{road}}}\n{{{addition}}}\n{{#first}} {{{suburb}}} || {{{city_district}}} || {{{neighbourhood}}} {{/first}}\n{{#first}} {{{city}}} || {{{town}}} || {{{village}}} || {{{hamlet}}} || {{{state}}} || {{/first}} {{{postcode}}}\n{{{state}}} {{{county}}}\n{{{country}}}\n{{{infos}}}\n"
};
var PL$4 = {
	address_template: "{{{attention}}}\n{{{house}}}\n{{{floor}}} {{{door}}}\n{{#first}} {{{road}}} || {{{place}}} || {{{hamlet}}} {{/first}} {{{house_number}}}\n{{{addition}}}\n{{{postcode}}} {{#first}} {{{postal_city}}} || {{{town}}} || {{{city}}} || {{{village}}} || {{{municipality}}} || {{{hamlet}}} || {{{county}}} || {{{state}}} || {{/first}}\n{{{archipelago}}}\n{{{state}}} {{{county}}}\n{{{country}}}\n{{{infos}}}\n",
	postformat_replace: [
		[
			"\n(\\d{2})(\\w{3}) ",
			"\n$1-$2 "
		]
	]
};
var PM$2 = {
	use_country: "FR",
	change_country: "Saint-Pierre-et-Miquelon, France"
};
var PN$2 = {
	address_template: "{{{attention}}}\n{{{house}}}\n{{{floor}}} {{{door}}}\n{{#first}} {{{city}}} || {{{town}}} || {{{island}}} {{/first}}\n{{{state}}} {{{county}}}\n{{{country}}}\n{{{infos}}}\n"
};
var PR$2 = {
	use_country: "US",
	change_country: "United States of America",
	add_component: "state=Puerto Rico"
};
var PS$2 = {
	use_country: "IL"
};
var PT$4 = {
	address_template: "{{{attention}}}\n{{{house}}}\n{{{floor}}} {{{door}}}\n{{#first}} {{{road}}} || {{{place}}} || {{{hamlet}}} {{/first}} {{{house_number}}}\n{{{addition}}}\n{{{postcode}}} {{#first}} {{{postal_city}}} || {{{town}}} || {{{city}}} || {{{village}}} || {{{municipality}}} || {{{hamlet}}} || {{{county}}} || {{{state}}} || {{/first}}\n{{{archipelago}}}\n{{{state}}} {{{county}}}\n{{{country}}}\n{{{infos}}}\n",
	postformat_replace: [
		[
			"\n(\\d{4})(\\d{3}) ",
			"\n$1-$2 "
		]
	]
};
var PW$2 = {
	address_template: "{{{attention}}}\n{{{house}}}\n{{{floor}}} {{{door}}}\n{{#first}} {{{road}}} || {{{place}}} || {{{hamlet}}} {{/first}} {{{house_number}}}\n{{{addition}}}\n{{{postcode}}} {{#first}} {{{postal_city}}} || {{{town}}} || {{{city}}} || {{{village}}} || {{{municipality}}} || {{{hamlet}}} || {{{county}}} || {{{state}}} || {{/first}}\n{{{archipelago}}}\n{{{state}}} {{{county}}}\n{{{country}}}\n{{{infos}}}\n"
};
var PY$2 = {
	address_template: "{{{attention}}}\n{{{house}}}\n{{{floor}}} {{{door}}}\n{{#first}} {{{road}}} || {{{place}}} || {{{hamlet}}} {{/first}} {{{house_number}}}\n{{{addition}}}\n{{{postcode}}} {{#first}} {{{postal_city}}} || {{{town}}} || {{{city}}} || {{{village}}} || {{{municipality}}} || {{{hamlet}}} || {{{county}}} || {{{state}}} || {{/first}}\n{{{archipelago}}}\n{{{state}}} {{{county}}}\n{{{country}}}\n{{{infos}}}\n"
};
var QA$3 = {
	address_template: "{{{attention}}}\n{{{house}}}\n{{{floor}}} {{{door}}}\n{{{road}}} {{{house_number}}}\n{{{addition}}}\n{{#first}} {{{city}}} || {{{town}}} || {{{village}}} || {{{hamlet}}} || {{{municipality}}} || {{{county}}} || {{{state_district}}} || {{{state}}} || {{/first}}\n{{{state}}} {{{county}}}\n{{{country}}}\n{{{infos}}}\n"
};
var RE$2 = {
	use_country: "FR",
	change_country: "La Réunion, France"
};
var RO$4 = {
	address_template: "{{{attention}}}\n{{{house}}}\n{{{floor}}} {{{door}}}\n{{#first}} {{{road}}} || {{{place}}} || {{{hamlet}}} {{/first}} {{{house_number}}}\n{{{addition}}}\n{{{postcode}}} {{#first}} {{{postal_city}}} || {{{town}}} || {{{city}}} || {{{village}}} || {{{municipality}}} || {{{hamlet}}} || {{{county}}} || {{{state}}} || {{/first}}\n{{{archipelago}}}\n{{{state}}} {{{county}}}\n{{{country}}}\n{{{infos}}}\n"
};
var RS$2 = {
	address_template: "{{{attention}}}\n{{{house}}}\n{{{floor}}} {{{door}}}\n{{#first}} {{{road}}} || {{{place}}} || {{{hamlet}}} {{/first}} {{{house_number}}}\n{{{addition}}}\n{{{postcode}}} {{#first}} {{{postal_city}}} || {{{town}}} || {{{city}}} || {{{village}}} || {{{municipality}}} || {{{hamlet}}} || {{{county}}} || {{{state}}} || {{/first}}\n{{{archipelago}}}\n{{{state}}} {{{county}}}\n{{{country}}}\n{{{infos}}}\n"
};
var RU$3 = {
	address_template: "{{{attention}}}\n{{{house}}}\n{{{floor}}} {{{door}}}\n{{{road}}}, {{{house_number}}}\n{{{addition}}}\n{{#first}} {{{suburb}}} || {{{city_district}}} {{/first}}\n{{#first}} {{{city}}} || {{{town}}} || {{{village}}} || {{{hamlet}}} {{/first}}\n{{{state}}}\n{{{state}}} {{{county}}}\n{{{country}}}\n{{{infos}}}\n{{{postcode}}}\n",
	fallback_template: "{{{attention}}}\n{{{house}}}\n{{{floor}}} {{{door}}}\n{{{road}}}, {{{house_number}}}\n{{{addition}}}\n{{#first}} {{{suburb}}} || {{{city_district}}} || {{{neighbourhood}}} || {{{island}}} || {{{village}}} || {{{hamlet}}} {{/first}}\n{{#first}} {{{city}}} || {{{town}}} || {{{municipality}}} {{/first}}\n{{#first}} || {{{county}}} || {{{state_district}}} || {{{state}}} || {{/first}}\n{{{state}}} {{{county}}}\n{{{country}}}\n{{{infos}}}\n"
};
var RW$2 = {
	address_template: "{{{attention}}}\n{{{house}}}\n{{{floor}}} {{{door}}}\n{{{house_number}}} {{{road}}}\n{{{addition}}}\n{{#first}} {{{city}}} || {{{town}}} || {{{village}}} || {{{hamlet}}} || {{{municipality}}} || {{{county}}} || {{{state_district}}} || {{{state}}} || {{/first}}\n{{{state}}} {{{county}}}\n{{{country}}}\n{{{infos}}}\n"
};
var SA$2 = {
	address_template: "{{{attention}}}\n{{{house}}}\n{{{floor}}} {{{door}}}\n{{{house_number}}} {{{road}}}, {{#first}} {{{village}}} || {{{hamlet}}} || {{{city_district}}} || {{{suburb}}} || {{{neighbourhood}}} {{/first}}\n{{{addition}}}\n{{#first}} {{{city}}} || {{{town}}} || {{{state_district}}} {{/first}} {{{postcode}}}\n{{{state}}} {{{county}}}\n{{{country}}}\n{{{infos}}}\n"
};
var SB$3 = {
	address_template: "{{{attention}}}\n{{{house}}}\n{{{floor}}} {{{door}}}\n{{{road}}} {{{house_number}}}\n{{{addition}}}\n{{#first}} {{{city}}} || {{{town}}} || {{{village}}} || {{{hamlet}}} || {{{municipality}}} || {{{county}}} || {{{state_district}}} || {{{state}}} || {{/first}}\n{{{state}}} {{{county}}}\n{{{country}}}\n{{{infos}}}\n"
};
var SC$2 = {
	address_template: "{{{attention}}}\n{{{house}}}\n{{{floor}}} {{{door}}}\n{{{house_number}}} {{{road}}}\n{{{addition}}}\n{{#first}} {{{city}}} || {{{town}}} || {{{village}}} || {{{hamlet}}} || {{{island}}} {{/first}}\n{{{island}}}\n{{{state}}} {{{county}}}\n{{{country}}}\n{{{infos}}}\n"
};
var SD$3 = {
	address_template: "{{{attention}}}\n{{{house}}}\n{{{floor}}} {{{door}}}\n{{#first}} {{{road}}} || {{{place}}} || {{{hamlet}}} {{/first}} {{{house_number}}}\n{{{addition}}}\n{{{postcode}}} {{#first}} {{{postal_city}}} || {{{town}}} || {{{city}}} || {{{village}}} || {{{municipality}}} || {{{hamlet}}} || {{{county}}} || {{{state}}} || {{/first}}\n{{{archipelago}}}\n{{{state}}} {{{county}}}\n{{{country}}}\n{{{infos}}}\n"
};
var SE$3 = {
	address_template: "{{{attention}}}\n{{{house}}}\n{{{floor}}} {{{door}}}\n{{#first}} {{{road}}} || {{{place}}} || {{{hamlet}}} {{/first}} {{{house_number}}}\n{{{addition}}}\n{{{postcode}}} {{#first}} {{{postal_city}}} || {{{town}}} || {{{city}}} || {{{village}}} || {{{municipality}}} || {{{hamlet}}} || {{{county}}} || {{{state}}} || {{/first}}\n{{{archipelago}}}\n{{{state}}} {{{county}}}\n{{{country}}}\n{{{infos}}}\n",
	postformat_replace: [
		[
			"\n(\\d{3})(\\d{2}) ",
			"\n$1 $2 "
		]
	]
};
var SG$2 = {
	address_template: "{{{attention}}}\n{{#first}} {{{house}}}, {{{quarter}}} || {{{house}}} {{/first}}\n{{{floor}}} {{{door}}}\n{{{house_number}}} {{{road}}}, {{{residential}}}\n{{#first}} {{{country}}} || {{{town}}} || {{{city}}} || {{{municipality}}} || {{{hamlet}}} || {{{village}}} || {{{county}}} || {{/first}} {{{postcode}}}\n{{{state}}} {{{county}}}\n{{{country}}}\n{{{infos}}}\n"
};
var SH$3 = {
	use_country: "GB",
	change_country: "$state, United Kingdom"
};
var SI$2 = {
	address_template: "{{{attention}}}\n{{{house}}}\n{{{floor}}} {{{door}}}\n{{#first}} {{{road}}} || {{{place}}} || {{{hamlet}}} {{/first}} {{{house_number}}}\n{{{addition}}}\n{{{postcode}}} {{#first}} {{{postal_city}}} || {{{town}}} || {{{city}}} || {{{village}}} || {{{municipality}}} || {{{hamlet}}} || {{{county}}} || {{{state}}} || {{/first}}\n{{{archipelago}}}\n{{{state}}} {{{county}}}\n{{{country}}}\n{{{infos}}}\n"
};
var SJ$2 = {
	use_country: "NO",
	change_country: "Norway"
};
var SK$4 = {
	address_template: "{{{attention}}}\n{{{house}}}\n{{{floor}}} {{{door}}}\n{{{road}}} {{{house_number}}}\n{{{addition}}}\n{{{postcode}}} {{#first}} {{{postal_city}}} || {{{city}}} || {{{town}}} || {{{village}}} || {{{municipality}}} || {{{city_district}}} || {{{hamlet}}} || {{{county}}} || {{{state}}} || {{/first}}\n{{{state}}} {{{county}}}\n{{{country}}}\n{{{infos}}}\n",
	replace: [
		[
			"^District of ",
			""
		],
		[
			"^Region of ",
			""
		]
	],
	postformat_replace: [
		[
			"\n(\\d{3})(\\d{2}) ",
			"\n$1 $2 "
		]
	]
};
var SL$4 = {
	address_template: "{{{attention}}}\n{{{house}}}\n{{{floor}}} {{{door}}}\n{{{house_number}}} {{{road}}}\n{{{addition}}}\n{{#first}} {{{city}}} || {{{town}}} || {{{village}}} || {{{hamlet}}} || {{{municipality}}} || {{{county}}} || {{{state_district}}} || {{{state}}} || {{/first}}\n{{{state}}} {{{county}}}\n{{{country}}}\n{{{infos}}}\n"
};
var SM$2 = {
	use_country: "IT"
};
var SN$3 = {
	address_template: "{{{attention}}}\n{{{house}}}\n{{{floor}}} {{{door}}}\n{{{house_number}}} {{{road}}}\n{{{addition}}}\n{{{place}}}\n{{{postcode}}} {{#first}} {{{town}}} || {{{village}}} || {{{hamlet}}} || {{{city}}} || {{{municipality}}} || {{{state}}} || {{/first}}\n{{{state}}} {{{county}}}\n{{{country}}}\n{{{infos}}}\n",
	replace: [
		[
			"^Commune de ",
			""
		],
		[
			"^Arrondissement de ",
			""
		],
		[
			"^Département de ",
			""
		]
	]
};
var SO$3 = {
	address_template: "{{{attention}}}\n{{{house}}}\n{{{floor}}} {{{door}}}\n{{{road}}} {{{house_number}}}\n{{{addition}}}\n{{#first}} {{{suburb}}} || {{{city_district}}} || {{{neighbourhood}}} {{/first}}\n{{#first}} {{{city}}} || {{{town}}} || {{{village}}} || {{{hamlet}}} || {{{state}}} || {{/first}}\n{{{state}}} {{{county}}}\n{{{country}}}\n{{{infos}}}\n"
};
var SR$3 = {
	address_template: "{{{attention}}}\n{{{house}}}\n{{{floor}}} {{{door}}}\n{{{road}}} {{{house_number}}}\n{{{addition}}}\n{{#first}} {{{suburb}}} || {{{city_district}}} || {{{neighbourhood}}} {{/first}}\n{{#first}} {{{city}}} || {{{town}}} || {{{village}}} || {{{hamlet}}} || {{{state}}} || {{/first}}\n{{{state}}} {{{county}}}\n{{{country}}}\n{{{infos}}}\n"
};
var SS$3 = {
	address_template: "{{{attention}}}\n{{{house}}}\n{{{floor}}} {{{door}}}\n{{{road}}} {{{house_number}}}\n{{{addition}}}\n{{#first}} {{{city}}} || {{{town}}} || {{{village}}} || {{{hamlet}}} || {{{municipality}}} || {{{county}}} || {{{state_district}}} || {{{state}}} || {{/first}}\n{{{state}}} {{{county}}}\n{{{country}}}\n{{{infos}}}\n"
};
var ST$3 = {
	address_template: "{{{attention}}}\n{{{house}}}\n{{{floor}}} {{{door}}}\n{{{road}}} {{{house_number}}}\n{{{addition}}}\n{{#first}} {{{city}}} || {{{town}}} || {{{village}}} || {{{hamlet}}} || {{{municipality}}} || {{{county}}} || {{{state_district}}} || {{{state}}} || {{/first}}\n{{{state}}} {{{county}}}\n{{{country}}}\n{{{infos}}}\n"
};
var SV$4 = {
	address_template: "{{{attention}}}\n{{{house}}}\n{{{floor}}} {{{door}}}\n{{{road}}} {{{house_number}}}\n{{{addition}}}\n{{{postcode}}} - {{#first}} {{{city}}} || {{{town}}} || {{{village}}} || {{{hamlet}}} {{/first}}\n{{{state}}}\n{{{state}}} {{{county}}}\n{{{country}}}\n{{{infos}}}\n",
	postformat_replace: [
		[
			"\n- ",
			"\n "
		]
	]
};
var SX$2 = {
	address_template: "{{{attention}}}\n{{{house}}}\n{{{floor}}} {{{door}}}\n{{{road}}} {{{house_number}}}\n{{{addition}}}\n{{#first}} {{{city}}} || {{{town}}} || {{{village}}} || {{{hamlet}}} || {{{municipality}}} || {{{county}}} || {{{state_district}}} || {{{state}}} || {{/first}}\n{{{state}}} {{{county}}}\n{{{country}}}\n{{{infos}}}\n"
};
var SY$3 = {
	address_template: "{{{attention}}}\n{{{house}}}\n{{{floor}}} {{{door}}}\n{{{road}}}, {{{house_number}}}\n{{{addition}}}\n{{#first}} {{{village}}} || {{{hamlet}}} || {{{city_district}}} || {{{neighbourhood}}} || {{{suburb}}} {{/first}}\n{{{postcode}}} {{#first}} {{{city}}} || {{{town}}} || {{{state_district}}} || {{{state}}} || {{/first}}\n\n{{{state}}} {{{county}}}\n{{{country}}}\n{{{infos}}}\n"
};
var SZ$3 = {
	address_template: "{{{attention}}}\n{{{house}}}\n{{{floor}}} {{{door}}}\n{{{road}}} {{{house_number}}}\n{{{addition}}}\n{{#first}} {{{city}}} || {{{town}}} || {{{village}}} || {{{hamlet}}} || {{{state}}} || {{/first}}\n{{{postcode}}}\n{{{state}}} {{{county}}}\n{{{country}}}\n{{{infos}}}\n"
};
var TC$2 = {
	address_template: "{{{attention}}}\n{{{house}}}\n{{{floor}}} {{{door}}}\n{{{house_number}}} {{{road}}}\n{{{addition}}}\n{{{quarter}}}\n{{#first}} {{{village}}} || {{{town}}} || {{{city}}} || {{{municipality}}} || {{{hamlet}}} || {{{county}}} || {{/first}}\n{{{postcode}}}\n{{#first}} {{{country}}} || {{{state}}} || {{/first}}\n",
	fallback_template: "{{{attention}}}\n{{{house_number}}} {{{road}}}\n{{{addition}}}\n{{{quarter}}}\n{{#first}} {{{village}}} || {{{town}}} || {{{city}}} || {{{municipality}}} || {{{hamlet}}} || {{{county}}} || {{/first}}\n{{{island}}}\n{{{state}}} {{{county}}}\n{{{country}}}\n{{{infos}}}\n"
};
var TD$3 = {
	address_template: "{{{attention}}}\n{{{house}}}\n{{{floor}}} {{{door}}}\n{{{road}}} {{{house_number}}}\n{{{addition}}}\n{{#first}} {{{suburb}}} || {{{city_district}}} || {{{neighbourhood}}} {{/first}}\n{{#first}} {{{city}}} || {{{town}}} || {{{village}}} || {{{hamlet}}} || {{{state}}} || {{/first}}\n{{{state}}} {{{county}}}\n{{{country}}}\n{{{infos}}}\n"
};
var TF$2 = {
	use_country: "FR",
	change_country: "Terres australes et antarctiques françaises, France"
};
var TG$3 = {
	address_template: "{{{attention}}}\n{{{house}}}\n{{{floor}}} {{{door}}}\n{{{house_number}}}, {{{road}}}\n{{{addition}}}\n{{#first}} {{{city}}} || {{{town}}} || {{{village}}} || {{{hamlet}}} || {{{suburb}}} || {{{city_district}}} || {{{neighbourhood}}} || {{{state}}} || {{/first}}\n{{{state}}} {{{county}}}\n{{{country}}}\n{{{infos}}}\n"
};
var TH$2 = {
	address_template: "{{{attention}}}\n{{{house}}}\n{{{floor}}} {{{door}}}\n{{{house_number}}} {{#first}} {{{village}}} || {{{hamlet}}} {{/first}}\n{{{road}}}\n{{{addition}}}\n{{#first}} {{{neighbourhood}}} || {{{city}}} || {{{town}}} {{/first}}, {{#first}} {{{suburb}}} || {{{city_district}}} || {{{state_district}}} {{/first}}\n{{{state}}} {{{postcode}}}\n{{{state}}} {{{county}}}\n{{{country}}}\n{{{infos}}}\n"
};
var TJ$3 = {
	address_template: "{{{attention}}}\n{{{house}}}\n{{{floor}}} {{{door}}}\n{{#first}} {{{road}}} || {{{place}}} || {{{hamlet}}} {{/first}} {{{house_number}}}\n{{{addition}}}\n{{{postcode}}} {{#first}} {{{postal_city}}} || {{{town}}} || {{{city}}} || {{{village}}} || {{{municipality}}} || {{{hamlet}}} || {{{county}}} || {{{state}}} || {{/first}}\n{{{archipelago}}}\n{{{state}}} {{{county}}}\n{{{country}}}\n{{{infos}}}\n"
};
var TK$2 = {
	use_country: "NZ",
	change_country: "Tokelau, New Zealand"
};
var TL$3 = {
	address_template: "{{{attention}}}\n{{{house}}}\n{{{floor}}} {{{door}}}\n{{{road}}} {{{house_number}}}\n{{{addition}}}\n{{#first}} {{{city}}} || {{{town}}} || {{{village}}} || {{{hamlet}}} || {{{municipality}}} || {{{county}}} || {{{state_district}}} || {{{state}}} || {{/first}}\n{{{state}}} {{{county}}}\n{{{country}}}\n{{{infos}}}\n"
};
var TM$2 = {
	address_template: "{{{attention}}}\n{{{house}}}\n{{{floor}}} {{{door}}}\n{{{house_number}}}, {{{road}}}\n{{{addition}}}\n{{{postcode}}} {{#first}} {{{city}}} || {{{town}}} || {{{village}}} || {{{hamlet}}} || {{{state}}} || {{/first}}\n{{{state}}} {{{county}}}\n{{{country}}}\n{{{infos}}}\n"
};
var TN$2 = {
	address_template: "{{{attention}}}\n{{{house}}}\n{{{floor}}} {{{door}}}\n{{{house_number}}} {{{road}}}\n{{{addition}}}\n{{{place}}}\n{{{postcode}}} {{#first}} {{{town}}} || {{{village}}} || {{{hamlet}}} || {{{city}}} || {{{municipality}}} || {{{state}}} || {{/first}}\n{{{state}}} {{{county}}}\n{{{country}}}\n{{{infos}}}\n"
};
var TO$2 = {
	address_template: "{{{attention}}}\n{{{house}}}\n{{{floor}}} {{{door}}}\n{{{house_number}}} {{{road}}}\n{{{addition}}}\n{{#first}} {{{city}}} || {{{town}}} || {{{village}}} || {{{hamlet}}} || {{{municipality}}} || {{{county}}} || {{{state_district}}} || {{{state}}} || {{/first}}\n{{{state}}} {{{county}}}\n{{{country}}}\n{{{infos}}}\n"
};
var TR$3 = {
	address_template: "{{{attention}}}\n{{{house}}}\n{{{floor}}} {{{door}}}\n{{#first}} {{{road}}} || {{{place}}} || {{{hamlet}}} {{/first}} {{{house_number}}}\n{{{addition}}}\n{{{postcode}}} {{#first}} {{{postal_city}}} || {{{town}}} || {{{city}}} || {{{village}}} || {{{municipality}}} || {{{hamlet}}} || {{{county}}} || {{{state}}} || {{/first}}\n{{{archipelago}}}\n{{{state}}} {{{county}}}\n{{{country}}}\n{{{infos}}}\n"
};
var TT$3 = {
	address_template: "{{{attention}}}\n{{{house}}}\n{{{floor}}} {{{door}}}\n{{{house_number}}} {{{road}}}\n{{{addition}}}\n{{#first}} {{{suburb}}} || {{{city_district}}} || {{{state_district}}} {{/first}}\n{{#first}} {{{city}}} || {{{town}}} || {{{state_district}}} || {{{village}}} || {{{hamlet}}} {{/first}}, {{{postcode}}}\n{{{state}}} {{{county}}}\n{{{country}}}\n{{{infos}}}\n"
};
var TV$2 = {
	address_template: "{{{attention}}}\n{{{house}}}\n{{{floor}}} {{{door}}}\n{{{house_number}}} {{{road}}}\n{{{addition}}}\n{{#first}} {{{city}}} || {{{town}}} || {{{village}}} || {{{hamlet}}} || {{{municipality}}} {{/first}}\n{{#first}} || {{{county}}} || {{{state_district}}} || {{{state}}} || {{{island}}} {{/first}}\n{{{state}}} {{{county}}}\n{{{country}}}\n{{{infos}}}\n"
};
var TW$2 = {
	address_template: "{{{country}}}\n{{{infos}}}\n{{{postcode}}}\n{{#first}} {{{city}}} || {{{town}}} || {{{village}}} || {{{hamlet}}} || {{{municipality}}} {{/first}} {{#first}} {{{suburb}}} || {{{city_district}}} || {{{neighbourhood}}} {{/first}} {{{road}}} {{{house_number}}}\n{{{addition}}}\n{{{house}}}\n{{{floor}}} {{{door}}}\n{{{attention}}}\n"
};
var TW_en = {
	address_template: "{{{attention}}}\n{{{house}}}\n{{{floor}}} {{{door}}}\n{{{house_number}}}, {{{road}}}\n{{{addition}}}\n{{#first}} {{{suburb}}} || {{{city_district}}} || {{{neighbourhood}}} {{/first}}, {{#first}} {{{city}}} || {{{town}}} || {{{village}}} || {{{hamlet}}} {{/first}} {{{postcode}}}\n{{{state}}} {{{county}}}\n{{{country}}}\n{{{infos}}}\n"
};
var TW_zh = {
	address_template: "{{{country}}}\n{{{infos}}}\n{{{postcode}}}\n{{#first}} {{{city}}} || {{{town}}} || {{{village}}} || {{{hamlet}}} || {{{municipality}}} {{/first}} {{#first}} {{{suburb}}} || {{{city_district}}} || {{{neighbourhood}}} {{/first}} {{{road}}} {{{house_number}}}\n{{{addition}}}\n{{{house}}}\n{{{floor}}} {{{door}}}\n{{{attention}}}\n"
};
var TZ$2 = {
	address_template: "{{{attention}}}\n{{{house}}}\n{{{floor}}} {{{door}}}\n{{{house_number}}} {{{road}}}\n{{{addition}}}\n{{{postcode}}} {{#first}} {{{city}}} || {{{town}}} || {{{village}}} || {{{hamlet}}} || {{{state_district}}} {{/first}}\n{{{state}}}\n{{{state}}} {{{county}}}\n{{{country}}}\n{{{infos}}}\n",
	fallback_template: "{{{attention}}}\n{{{house}}}\n{{{floor}}} {{{door}}}\n{{{house_number}}} {{{road}}}\n{{{addition}}}\n{{{postcode}}} {{#first}} {{{city}}} || {{{town}}} || {{{village}}} || {{{hamlet}}} || {{{state_district}}} {{/first}}\n{{{state}}}\n{{{state}}} {{{county}}}\n{{{country}}}\n{{{infos}}}\n",
	postformat_replace: [
		[
			"Dar es Salaam\nDar es Salaam",
			"Dar es Salaam"
		]
	]
};
var UA$2 = {
	address_template: "{{{attention}}}\n{{{house}}}\n{{{floor}}} {{{door}}}\n{{{road}}}, {{{house_number}}}\n{{{addition}}}\n{{#first}} {{{suburb}}} || {{{city_district}}} || {{{state_district}}} {{/first}}\n{{#first}} {{{city}}} || {{{town}}} || {{{village}}} || {{{hamlet}}} || {{{municipality}}} {{/first}}\n{{#first}} {{{region}}} || {{{state}}} || {{/first}}\n{{{postcode}}}\n{{{state}}} {{{county}}}\n{{{country}}}\n{{{infos}}}\n"
};
var UG$2 = {
	address_template: "{{{attention}}}\n{{{house}}}\n{{{floor}}} {{{door}}}\n{{{house_number}}} {{{road}}}\n{{{addition}}}\n{{#first}} {{{city}}} || {{{town}}} || {{{village}}} || {{{hamlet}}} || {{{municipality}}} || {{{county}}} || {{{state_district}}} || {{{state}}} || {{/first}}\n{{{state}}} {{{county}}}\n{{{country}}}\n{{{infos}}}\n"
};
var UM$2 = {
	fallback_template: "{{{attention}}}\n{{{house}}}\n{{{floor}}} {{{door}}}\n{{{road}}} {{{house_number}}}\n{{{addition}}}\n{{{place}}}\n{{#first}} {{{suburb}}} || {{{village}}} || {{{hamlet}}} {{/first}}\n{{#first}} {{{city}}} || {{{town}}} || {{{municipality}}} || {{{county}}} || {{{island}}} || {{{state_district}}} {{/first}}, {{#first}} || {{{state}}} || {{{state_code}}} {{/first}}\n{{{country}}}\n{{{infos}}}\n",
	use_country: "US",
	change_country: "United States of America",
	add_component: "state=US Minor Outlying Islands"
};
var US$3 = {
	address_template: "{{{attention}}}\n{{{house}}}\n{{{floor}}} {{{door}}}\n{{{house_number}}} {{{road}}}\n{{{addition}}}\n{{#first}} {{{village}}} || {{{hamlet}}} {{/first}}\n{{#first}} {{{city}}} || {{{town}}} || {{{state_district}}} || {{{suburb}}} || {{{municipality}}} || {{{county}}} || {{/first}}, {{#first}} {{{state_code}}} || {{{state}}} || {{/first}} {{{postcode}}}\n{{{country}}}\n{{{infos}}}\n",
	fallback_template: "{{{attention}}}\n{{{house}}}\n{{{floor}}} {{{door}}}\n{{{road}}} {{{house_number}}}\n{{{addition}}}\n{{{place}}}\n{{#first}} {{{suburb}}} || {{{village}}} || {{{hamlet}}} {{/first}}\n{{#first}} {{{city}}} || {{{town}}} || {{{municipality}}} || {{{county}}} || {{{island}}} || {{{state_district}}} {{/first}}, {{#first}} || {{{state}}} || {{{state_code}}} {{/first}}\n{{{country}}}\n{{{infos}}}\n",
	replace: [
		[
			"state=United States Virgin Islands",
			"US Virgin Islands"
		],
		[
			"state=USVI",
			"US Virgin Islands"
		]
	],
	postformat_replace: [
		[
			"\nUS$",
			"\nUnited States of America"
		],
		[
			"\nUSA$",
			"\nUnited States of America"
		],
		[
			"\nUnited States$",
			"\nUnited States of America"
		],
		[
			"Town of ",
			""
		],
		[
			"Township of ",
			""
		]
	]
};
var UZ$3 = {
	address_template: "{{{attention}}}\n{{{house}}}\n{{{floor}}} {{{door}}}\n{{{road}}} {{{house_number}}}\n{{{addition}}}\n{{#first}} {{{city}}} || {{{town}}} || {{{village}}} || {{{hamlet}}} {{/first}}\n{{#first}} || {{{state}}} || {{{state_district}}} {{/first}}\n{{{state}}} {{{county}}}\n{{{country}}}\n{{{infos}}}\n{{{postcode}}}\n"
};
var UY$3 = {
	address_template: "{{{attention}}}\n{{{house}}}\n{{{floor}}} {{{door}}}\n{{#first}} {{{road}}} || {{{place}}} || {{{hamlet}}} {{/first}} {{{house_number}}}\n{{{addition}}}\n{{{postcode}}} {{#first}} {{{postal_city}}} || {{{town}}} || {{{city}}} || {{{village}}} || {{{municipality}}} || {{{hamlet}}} || {{{county}}} || {{{state}}} || {{/first}}\n{{{archipelago}}}\n{{{state}}} {{{county}}}\n{{{country}}}\n{{{infos}}}\n"
};
var VA$2 = {
	use_country: "IT"
};
var VC$2 = {
	address_template: "{{{attention}}}\n{{{house}}}\n{{{floor}}} {{{door}}}\n{{{road}}} {{{house_number}}}\n{{{addition}}}\n{{#first}} {{{city}}} || {{{town}}} || {{{village}}} || {{{hamlet}}} || {{{municipality}}} || {{{county}}} || {{{state_district}}} || {{{state}}} || {{/first}}\n{{{state}}} {{{county}}}\n{{{country}}}\n{{{infos}}}\n"
};
var VE$3 = {
	address_template: "{{{attention}}}\n{{{house}}}\n{{{floor}}} {{{door}}}\n{{{road}}} {{{house_number}}}\n{{{addition}}}\n{{#first}} {{{city}}} || {{{town}}} || {{{state_district}}} || {{{village}}} || {{{hamlet}}} {{/first}} {{{postcode}}}, {{#first}} {{{state_code}}} || {{{state}}} || {{/first}}\n{{{state}}} {{{county}}}\n{{{country}}}\n{{{infos}}}\n"
};
var VG$2 = {
	address_template: "{{{attention}}}\n{{{house}}}\n{{{floor}}} {{{door}}}\n{{{house_number}}} {{{road}}}\n{{{addition}}}\n{{#first}} {{{city}}} || {{{town}}} || {{{village}}} || {{{hamlet}}} {{/first}}, {{{island}}}\n{{{state}}} {{{county}}}\n{{{country}}}, {{{postcode}}}\n"
};
var VI$3 = {
	use_country: "US",
	change_country: "United States of America",
	add_component: "state=US Virgin Islands"
};
var VN$2 = {
	address_template: "{{{attention}}}\n{{{house}}}\n{{{floor}}} {{{door}}}\n{{{house_number}}} {{{road}}}\n{{{addition}}}\n{{#first}} {{{suburb}}} || {{{city_district}}} || {{{neighbourhood}}} {{/first}}\n{{#first}} {{{city}}} || {{{town}}} || {{{village}}} || {{{hamlet}}} || {{{state_district}}} {{/first}}\n{{{state}}} {{{postcode}}}\n{{{state}}} {{{county}}}\n{{{country}}}\n{{{infos}}}\n"
};
var VU$3 = {
	address_template: "{{{attention}}}\n{{{house}}}\n{{{floor}}} {{{door}}}\n{{{road}}} {{{house_number}}}\n{{{addition}}}\n{{#first}} {{{city}}} || {{{town}}} || {{{village}}} || {{{hamlet}}} || {{{municipality}}} || {{{county}}} || {{{state_district}}} || {{{state}}} || {{/first}}\n{{{state}}} {{{county}}}\n{{{country}}}\n{{{infos}}}\n"
};
var WF$2 = {
	use_country: "FR",
	change_country: "Wallis-et-Futuna, France"
};
var WS$2 = {
	address_template: "{{{attention}}}\n{{{house}}}\n{{{floor}}} {{{door}}}\n{{{road}}} {{{house_number}}}\n{{{addition}}}\n{{#first}} {{{city}}} || {{{town}}} || {{{village}}} || {{{hamlet}}} || {{{municipality}}} || {{{county}}} || {{{state_district}}} || {{{state}}} || {{/first}}\n{{{state}}} {{{county}}}\n{{{country}}}\n{{{infos}}}\n"
};
var XC$1 = {
	address_template: "{{{attention}}}\n{{{house}}}\n{{{floor}}} {{{door}}}\n{{{house_number}}} {{{road}}}\n{{{addition}}}\n{{#first}} {{{city}}} || {{{town}}} || {{{village}}} || {{{hamlet}}} || {{{municipality}}} {{/first}}\n{{{county}}}\n{{{state}}}\n{{{state}}} {{{county}}}\n{{{country}}}\n{{{infos}}}\n"
};
var XK$2 = {
	address_template: "{{{attention}}}\n{{{house}}}\n{{{floor}}} {{{door}}}\n{{{house_number}}}, {{{road}}}\n{{{addition}}}\n{{#first}} {{{city}}} || {{{town}}} || {{{village}}} || {{{hamlet}}} || {{{state}}} || {{/first}} {{{postcode}}}\n{{{state}}} {{{county}}}\n{{{country}}}\n{{{infos}}}\n"
};
var YE$3 = {
	address_template: "{{{attention}}}\n{{{house}}}\n{{{floor}}} {{{door}}}\n{{{house_number}}}, {{{road}}}\n{{{addition}}}\n{{#first}} {{{city}}} || {{{town}}} || {{{village}}} || {{{hamlet}}} || {{{suburb}}} || {{{city_district}}} || {{{neighbourhood}}} || {{{state}}} || {{/first}}\n{{{state}}} {{{county}}}\n{{{country}}}\n{{{infos}}}\n"
};
var YT$2 = {
	use_country: "FR",
	change_country: "Mayotte, France"
};
var ZA$3 = {
	address_template: "{{{attention}}}\n{{{house}}}\n{{{floor}}} {{{door}}}\n{{{house_number}}} {{{road}}}\n{{{addition}}}\n{{#first}} {{{suburb}}} || {{{city_district}}} || {{{state_district}}} {{/first}}\n{{#first}} {{{city}}} || {{{town}}} || {{{village}}} || {{{hamlet}}} || {{{state}}} || {{/first}}\n{{{postcode}}}\n{{{state}}} {{{county}}}\n{{{country}}}\n{{{infos}}}\n"
};
var ZM$2 = {
	address_template: "{{{attention}}}\n{{{house}}}\n{{{floor}}} {{{door}}}\n{{{house_number}}} {{{road}}}\n{{{addition}}}\n{{{place}}}\n{{{postcode}}} {{#first}} {{{town}}} || {{{village}}} || {{{hamlet}}} || {{{city}}} || {{{municipality}}} || {{{state}}} || {{/first}}\n{{{state}}} {{{county}}}\n{{{country}}}\n{{{infos}}}\n"
};
var ZW$3 = {
	address_template: "{{{attention}}}\n{{{house}}}\n{{{floor}}} {{{door}}}\n{{{house_number}}} {{{road}}}\n{{{addition}}}\n{{#first}} {{{city}}} || {{{town}}} || {{{village}}} || {{{hamlet}}} || {{{municipality}}} || {{{county}}} || {{{state_district}}} || {{{state}}} || {{/first}}\n{{{state}}} {{{county}}}\n{{{country}}}\n{{{infos}}}\n"
};
var templates = {
	generic1: generic1,
	generic2: generic2,
	generic3: generic3,
	generic4: generic4,
	generic5: generic5,
	generic6: generic6,
	generic7: generic7,
	generic8: generic8,
	generic9: generic9,
	generic10: generic10,
	generic11: generic11,
	generic12: generic12,
	generic13: generic13,
	generic14: generic14,
	generic15: generic15,
	generic16: generic16,
	generic17: generic17,
	generic18: generic18,
	generic19: generic19,
	generic20: generic20,
	generic21: generic21,
	generic22: generic22,
	generic23: generic23,
	fallback1: fallback1,
	fallback2: fallback2,
	fallback3: fallback3,
	fallback4: fallback4,
	"default": {
	address_template: "{{{attention}}}\n{{{house}}}\n{{{floor}}} {{{door}}}\n{{#first}} {{{road}}} || {{{place}}} || {{{hamlet}}} {{/first}} {{{house_number}}}\n{{{addition}}}\n{{{postcode}}} {{#first}} {{{postal_city}}} || {{{town}}} || {{{city}}} || {{{village}}} || {{{municipality}}} || {{{hamlet}}} || {{{county}}} || {{{state}}} || {{/first}}\n{{{archipelago}}}\n{{{state}}} {{{county}}}\n{{{country}}}\n{{{infos}}}\n",
	fallback_template: "{{{attention}}}\n{{{house}}}\n{{{floor}}} {{{door}}}\n{{{road}}} {{{house_number}}}\n{{{addition}}}\n{{{place}}}\n{{#first}} {{{suburb}}} || {{{city_district}}} || {{{neighbourhood}}} || {{{island}}} {{/first}}\n{{#first}} {{{city}}} || {{{town}}} || {{{village}}} || {{{hamlet}}} || {{{municipality}}} {{/first}}\n{{#first}} || {{{county}}} || {{{state_district}}} || {{{state}}} || {{{region}}} || {{{island}}}, {{{archipelago}}} {{/first}}\n{{{state}}} {{{county}}}\n{{{country}}}\n{{{infos}}}\n"
},
	AD: AD$2,
	AE: AE$3,
	AF: AF$3,
	AG: AG$2,
	AI: AI$2,
	AL: AL$2,
	AM: AM$3,
	AO: AO$3,
	AQ: AQ$2,
	AR: AR$3,
	AS: AS$2,
	AT: AT$3,
	AU: AU$3,
	AW: AW$2,
	AX: AX$2,
	AZ: AZ$3,
	BA: BA$3,
	BB: BB$2,
	BD: BD$3,
	BE: BE$3,
	BF: BF$3,
	BG: BG$2,
	BH: BH$2,
	BI: BI$3,
	BJ: BJ$3,
	BL: BL$2,
	BM: BM$2,
	BN: BN$3,
	BO: BO$3,
	BQ: BQ$2,
	BR: BR$3,
	BS: BS$2,
	BT: BT$2,
	BV: BV$2,
	BW: BW$3,
	BY: BY$3,
	BZ: BZ$3,
	CA: CA$4,
	CA_en: CA_en,
	CA_fr: CA_fr,
	CC: CC$2,
	CD: CD$3,
	CF: CF$3,
	CG: CG$2,
	CH: CH$3,
	CI: CI$3,
	CK: CK$2,
	CL: CL$3,
	CM: CM$3,
	CN: CN$2,
	CN_en: CN_en,
	CN_zh: CN_zh,
	CO: CO$3,
	CR: CR$3,
	CU: CU$2,
	CV: CV$3,
	CW: CW$2,
	CX: CX$2,
	CY: CY$2,
	CZ: CZ$2,
	DE: DE$4,
	DJ: DJ$3,
	DK: DK$2,
	DM: DM$2,
	DO: DO$2,
	DZ: DZ$2,
	EC: EC$3,
	EG: EG$2,
	EE: EE$2,
	EH: EH$2,
	ER: ER$3,
	ES: ES$5,
	ET: ET$3,
	FI: FI$3,
	FJ: FJ$3,
	FK: FK$2,
	FM: FM$3,
	FO: FO$2,
	FR: FR$4,
	GA: GA$2,
	GB: GB$4,
	GD: GD$2,
	GE: GE$3,
	GF: GF$2,
	GG: GG$2,
	GH: GH$3,
	GI: GI$2,
	GL: GL$4,
	GM: GM$3,
	GN: GN$3,
	GP: GP$2,
	GQ: GQ$3,
	GR: GR$2,
	GS: GS$2,
	GT: GT$3,
	GU: GU$2,
	GW: GW$3,
	GY: GY$3,
	HK: HK$2,
	HK_en: HK_en,
	HK_zh: HK_zh,
	HM: HM$2,
	HN: HN$3,
	HR: HR$2,
	HT: HT$3,
	HU: HU$4,
	ID: ID$3,
	IE: IE$4,
	IL: IL$2,
	IM: IM$2,
	IN: IN$3,
	IO: IO$2,
	IQ: IQ$2,
	IR: IR$2,
	IR_en: IR_en,
	IR_fa: IR_fa,
	IS: IS$2,
	IT: IT$5,
	JE: JE$2,
	JM: JM$2,
	JO: JO$3,
	JP: JP$2,
	JP_en: JP_en,
	JP_ja: JP_ja,
	KE: KE$2,
	KG: KG$3,
	KH: KH$2,
	KI: KI$3,
	KM: KM$3,
	KN: KN$3,
	KP: KP$2,
	KR: KR$2,
	KR_en: KR_en,
	KR_ko: KR_ko,
	KW: KW$3,
	KY: KY$2,
	KZ: KZ$3,
	LA: LA$3,
	LB: LB$3,
	LC: LC$2,
	LI: LI$2,
	LK: LK$2,
	LR: LR$3,
	LS: LS$3,
	LT: LT$3,
	LU: LU$3,
	LV: LV$2,
	LY: LY$3,
	MA: MA$2,
	MC: MC$2,
	MD: MD$3,
	ME: ME$2,
	MF: MF$2,
	MH: MH$2,
	MG: MG$3,
	MK: MK$2,
	ML: ML$2,
	MM: MM$2,
	MN: MN$2,
	MO: MO$2,
	MO_pt: MO_pt,
	MO_zh: MO_zh,
	MP: MP$2,
	MS: MS$2,
	MT: MT$2,
	MQ: MQ$2,
	MR: MR$2,
	MU: MU$3,
	MV: MV$2,
	MW: MW$3,
	MX: MX$3,
	MY: MY$3,
	MZ: MZ$3,
	NA: NA$3,
	NC: NC$2,
	NE: NE$2,
	NF: NF$2,
	NG: NG$3,
	NI: NI$3,
	NL: NL$4,
	NO: NO$3,
	NP: NP$2,
	NR: NR$2,
	NU: NU$2,
	NZ: NZ$3,
	OM: OM$3,
	PA: PA$2,
	PE: PE$3,
	PF: PF$2,
	PG: PG$3,
	PH: PH$3,
	PK: PK$3,
	PL: PL$4,
	PM: PM$2,
	PN: PN$2,
	PR: PR$2,
	PS: PS$2,
	PT: PT$4,
	PW: PW$2,
	PY: PY$2,
	QA: QA$3,
	RE: RE$2,
	RO: RO$4,
	RS: RS$2,
	RU: RU$3,
	RW: RW$2,
	SA: SA$2,
	SB: SB$3,
	SC: SC$2,
	SD: SD$3,
	SE: SE$3,
	SG: SG$2,
	SH: SH$3,
	SI: SI$2,
	SJ: SJ$2,
	SK: SK$4,
	SL: SL$4,
	SM: SM$2,
	SN: SN$3,
	SO: SO$3,
	SR: SR$3,
	SS: SS$3,
	ST: ST$3,
	SV: SV$4,
	SX: SX$2,
	SY: SY$3,
	SZ: SZ$3,
	TC: TC$2,
	TD: TD$3,
	TF: TF$2,
	TG: TG$3,
	TH: TH$2,
	TJ: TJ$3,
	TK: TK$2,
	TL: TL$3,
	TM: TM$2,
	TN: TN$2,
	TO: TO$2,
	TR: TR$3,
	TT: TT$3,
	TV: TV$2,
	TW: TW$2,
	TW_en: TW_en,
	TW_zh: TW_zh,
	TZ: TZ$2,
	UA: UA$2,
	UG: UG$2,
	UM: UM$2,
	US: US$3,
	UZ: UZ$3,
	UY: UY$3,
	VA: VA$2,
	VC: VC$2,
	VE: VE$3,
	VG: VG$2,
	VI: VI$3,
	VN: VN$2,
	VU: VU$3,
	WF: WF$2,
	WS: WS$2,
	XC: XC$1,
	XK: XK$2,
	YE: YE$3,
	YT: YT$2,
	ZA: ZA$3,
	ZM: ZM$2,
	ZW: ZW$3
};

var aliases = [
	{
		alias: "street_number",
		name: "house_number"
	},
	{
		alias: "housenumber",
		name: "house_number"
	},
	{
		alias: "house_number",
		name: "house_number"
	},
	{
		alias: "building",
		name: "house"
	},
	{
		alias: "floor",
		name: "floor"
	},
	{
		alias: "door",
		name: "door"
	},
	{
		alias: "infos",
		name: "infos"
	},
	{
		alias: "addition",
		name: "addition"
	},
	{
		alias: "public_building",
		name: "house"
	},
	{
		alias: "isolated_dwelling",
		name: "house"
	},
	{
		alias: "farmland",
		name: "house"
	},
	{
		alias: "allotments",
		name: "house"
	},
	{
		alias: "house",
		name: "house"
	},
	{
		alias: "footway",
		name: "road"
	},
	{
		alias: "street",
		name: "road"
	},
	{
		alias: "street_name",
		name: "road"
	},
	{
		alias: "residential",
		name: "road"
	},
	{
		alias: "path",
		name: "road"
	},
	{
		alias: "pedestrian",
		name: "road"
	},
	{
		alias: "road_reference",
		name: "road"
	},
	{
		alias: "road_reference_intl",
		name: "road"
	},
	{
		alias: "square",
		name: "road"
	},
	{
		alias: "road",
		name: "road"
	},
	{
		alias: "farmland",
		name: "place"
	},
	{
		alias: "allotments",
		name: "place"
	},
	{
		alias: "place",
		name: "place"
	},
	{
		alias: "locality",
		name: "hamlet"
	},
	{
		alias: "croft",
		name: "hamlet"
	},
	{
		alias: "hamlet",
		name: "hamlet"
	},
	{
		alias: "village",
		name: "village"
	},
	{
		alias: "suburb",
		name: "neighbourhood"
	},
	{
		alias: "city_district",
		name: "neighbourhood"
	},
	{
		alias: "commune",
		name: "neighbourhood"
	},
	{
		alias: "district",
		name: "neighbourhood"
	},
	{
		alias: "quarter",
		name: "neighbourhood"
	},
	{
		alias: "borough",
		name: "neighbourhood"
	},
	{
		alias: "city_block",
		name: "neighbourhood"
	},
	{
		alias: "residential",
		name: "neighbourhood"
	},
	{
		alias: "commercial",
		name: "neighbourhood"
	},
	{
		alias: "industrial",
		name: "neighbourhood"
	},
	{
		alias: "houses",
		name: "neighbourhood"
	},
	{
		alias: "subdistrict",
		name: "neighbourhood"
	},
	{
		alias: "subdivision",
		name: "neighbourhood"
	},
	{
		alias: "ward",
		name: "neighbourhood"
	},
	{
		alias: "neighbourhood",
		name: "neighbourhood"
	},
	{
		alias: "postal_city",
		name: "postal_city"
	},
	{
		alias: "town",
		name: "city"
	},
	{
		alias: "township",
		name: "city"
	},
	{
		alias: "city",
		name: "city"
	},
	{
		alias: "local_administrative_area",
		name: "municipality"
	},
	{
		alias: "subcounty",
		name: "municipality"
	},
	{
		alias: "municipality",
		name: "municipality"
	},
	{
		alias: "county_code",
		name: "county"
	},
	{
		alias: "department",
		name: "county"
	},
	{
		alias: "county",
		name: "county"
	},
	{
		alias: "state_district",
		name: "state_district"
	},
	{
		alias: "postal_code",
		name: "postcode"
	},
	{
		alias: "partial_postcode",
		name: "postcode"
	},
	{
		alias: "postcode",
		name: "postcode"
	},
	{
		alias: "province",
		name: "state"
	},
	{
		alias: "state_code",
		name: "state"
	},
	{
		alias: "territory",
		name: "state"
	},
	{
		alias: "state",
		name: "state"
	},
	{
		alias: "oblast",
		name: "region"
	},
	{
		alias: "raion",
		name: "region"
	},
	{
		alias: "region",
		name: "region"
	},
	{
		alias: "island",
		name: "island"
	},
	{
		alias: "archipelago",
		name: "archipelago"
	},
	{
		alias: "country_name",
		name: "country"
	},
	{
		alias: "country",
		name: "country"
	},
	{
		alias: "country_code",
		name: "country_code"
	},
	{
		alias: "continent",
		name: "continent"
	}
];

var AE$2 = [
	{
		name: {
			"default": "عجمان",
			alt_en: "Ajman Emirate"
		},
		key: "AJ"
	},
	{
		name: {
			"default": "أبو ظبي",
			alt_en: "Abu Dhabi Emirate"
		},
		key: "AZ"
	},
	{
		name: {
			"default": "دبي",
			alt_en: "Dubai"
		},
		key: "DU"
	},
	{
		name: {
			"default": "فجيرة",
			alt_en: "Fujairah Emirate"
		},
		key: "FU"
	},
	{
		name: {
			"default": "رأس الخيمة",
			alt_en: "Ras al-Khaimah"
		},
		key: "RK"
	},
	{
		name: {
			"default": "الشارقة",
			alt_en: "Sharjah Emirate"
		},
		key: "SH"
	},
	{
		name: {
			"default": "أم القيوين",
			alt_en: "Umm al-Quwain"
		},
		key: "UQ"
	}
];
var AF$2 = [
	{
		name: {
			"default": "ولایت بلخ",
			alt_en: "Balkh Province"
		},
		key: "BAL"
	},
	{
		name: {
			"default": "ولایت بامیان",
			alt_en: "Bamyan"
		},
		key: "BAM"
	},
	{
		name: {
			"default": "ولایت بادغیس",
			alt_en: "Badghis"
		},
		key: "BDG"
	},
	{
		name: {
			"default": "ولایت بدخشان",
			alt_en: "Badakhshan Province"
		},
		key: "BDS"
	},
	{
		name: {
			"default": "ولایت بغلان",
			alt_en: "Baghlan Province"
		},
		key: "BGL"
	},
	{
		name: {
			"default": "ولایت دایکندی",
			alt_en: "Daykundi"
		},
		key: "DAY"
	},
	{
		name: {
			"default": "ولایت فراه",
			alt_en: "Farah Province"
		},
		key: "FRA"
	},
	{
		name: {
			"default": "ولایت فاریاب",
			alt_en: "Faryab"
		},
		key: "FYB"
	},
	{
		name: {
			"default": "ولایت غزنی",
			alt_en: "Ghazni Province"
		},
		key: "GHA"
	},
	{
		name: {
			"default": "غور",
			alt_en: "Ghor"
		},
		key: "GHO"
	},
	{
		name: {
			"default": "هلمند ولايت",
			alt_en: "Helmand"
		},
		key: "HEL"
	},
	{
		name: {
			"default": "ولایت هرات",
			alt_en: "Herat Province"
		},
		key: "HER"
	},
	{
		name: {
			"default": "ولایت جوزجان",
			alt_en: "Jowzjan Province"
		},
		key: "JOW"
	},
	{
		name: {
			"default": "ولایت كابل",
			alt_en: "Kabul Province"
		},
		key: "KAB"
	},
	{
		name: {
			"default": "کندهار ولايت",
			alt_en: "Kandahar"
		},
		key: "KAN"
	},
	{
		name: {
			"default": "ولایت کاپیسا",
			alt_en: "Kapisa Province"
		},
		key: "KAP"
	},
	{
		name: {
			"default": "ولایت کندز",
			alt_en: "Kunduz Province"
		},
		key: "KDZ"
	},
	{
		name: {
			"default": "خوست ولايت",
			alt_en: "Khost Province"
		},
		key: "KHO"
	},
	{
		name: {
			"default": "کونړ ولايت",
			alt_en: "Kunar Province"
		},
		key: "KNR"
	},
	{
		name: {
			"default": "لغمان ولايت",
			alt_en: "Laghman Province"
		},
		key: "LAG"
	},
	{
		name: {
			"default": "لوگر ولايت",
			alt_en: "Logar Province"
		},
		key: "LOG"
	},
	{
		name: {
			"default": "ننگرهار ولايت",
			alt_en: "Nangarhar Province"
		},
		key: "NAN"
	},
	{
		name: {
			"default": "ولایت نیمروز",
			alt_en: "Nimruz Province"
		},
		key: "NIM"
	},
	{
		name: {
			"default": "نورستان ولایت",
			alt_en: "Nuristan Province"
		},
		key: "NUR"
	},
	{
		name: {
			"default": "ولایت پنجشیر",
			alt_en: "Panjshir Province"
		},
		key: "PAN"
	},
	{
		name: {
			"default": "ولایت پروان",
			alt_en: "Parwan Province"
		},
		key: "PAR"
	},
	{
		name: {
			"default": "پکتيا ولايت",
			alt_en: "Paktia Province"
		},
		key: "PIA"
	},
	{
		name: {
			"default": "پکتيکا ولايت",
			alt_en: "Paktika Province"
		},
		key: "PKA"
	},
	{
		name: {
			"default": "ولایت سمنگان",
			alt_en: "Samangan"
		},
		key: "SAM"
	},
	{
		name: {
			"default": "سرپل",
			alt_en: "Sar-e Pol Province"
		},
		key: "SAR"
	},
	{
		name: {
			"default": "ولایت تخار",
			alt_en: "Takhar"
		},
		key: "TAK"
	},
	{
		name: {
			"default": "روزگان ولايت",
			alt_en: "Urōzgān"
		},
		key: "URU"
	},
	{
		name: {
			"default": "ميدان وردگ ولايت",
			alt_en: "Maidan Wardak"
		},
		key: "WAR"
	},
	{
		name: {
			"default": "زابل ولايت",
			alt_en: "Zabul Province"
		},
		key: "ZAB"
	}
];
var AM$2 = [
	{
		name: "Aragac̣otn",
		key: "AG"
	},
	{
		name: "Ararat",
		key: "AR"
	},
	{
		name: "Armavir",
		key: "AV"
	},
	{
		name: "Erevan",
		key: "ER"
	},
	{
		name: "Geġark'unik'",
		key: "GR"
	},
	{
		name: "Kotayk'",
		key: "KT"
	},
	{
		name: "Loṙi",
		key: "LO"
	},
	{
		name: "Širak",
		key: "SH"
	},
	{
		name: "Syunik'",
		key: "SU"
	},
	{
		name: "Tavuš",
		key: "TV"
	},
	{
		name: "Vayoć Jor",
		key: "VD"
	}
];
var AO$2 = [
	{
		name: "Bengo",
		key: "BGO"
	},
	{
		name: "Benguela",
		key: "BGU"
	},
	{
		name: "Bié",
		key: "BIE"
	},
	{
		name: "Cabinda",
		key: "CAB"
	},
	{
		name: "Kuando Kubango",
		key: "CCU"
	},
	{
		name: "Cunene",
		key: "CNN"
	},
	{
		name: "Kwanza Norte",
		key: "CNO"
	},
	{
		name: "Kwanza Sul",
		key: "CUS"
	},
	{
		name: "Huambo",
		key: "HUA"
	},
	{
		name: "Huíla",
		key: "HUI"
	},
	{
		name: "Lunda Norte",
		key: "LNO"
	},
	{
		name: "Lunda Sul",
		key: "LSU"
	},
	{
		name: "Luanda",
		key: "LUA"
	},
	{
		name: "Malange",
		key: "MAL"
	},
	{
		name: "Moxico",
		key: "MOX"
	},
	{
		name: "Namibe",
		key: "NAM"
	},
	{
		name: "Uíge",
		key: "UIG"
	},
	{
		name: "Zaire",
		key: "ZAI"
	}
];
var AR$2 = [
	{
		name: "Salta",
		key: "A"
	},
	{
		name: "Buenos Aires",
		key: "B"
	},
	{
		name: {
			"default": "Ciudad Autónoma de Buenos Aires",
			alt_en: "Autonomous City of Buenos Aires"
		},
		key: "C"
	},
	{
		name: "San Luis",
		key: "D"
	},
	{
		name: {
			"default": "Entre Ríos",
			alt_en: "Entre Ríos Province"
		},
		key: "E"
	},
	{
		name: "La Rioja",
		key: "F"
	},
	{
		name: "Santiago del Estero",
		key: "G"
	},
	{
		name: "Chaco",
		key: "H"
	},
	{
		name: "San Juan",
		key: "J"
	},
	{
		name: "Catamarca",
		key: "K"
	},
	{
		name: "La Pampa",
		key: "L"
	},
	{
		name: "Mendoza",
		key: "M"
	},
	{
		name: "Misiones",
		key: "N"
	},
	{
		name: "Formosa",
		key: "P"
	},
	{
		name: {
			"default": "Neuquén",
			alt_en: "Neuquén Province"
		},
		key: "Q"
	},
	{
		name: {
			"default": "Río Negro",
			alt_en: "Río Negro Province"
		},
		key: "R"
	},
	{
		name: "Santa Fe",
		key: "S"
	},
	{
		name: "Tucumán",
		key: "T"
	},
	{
		name: "Chubut",
		key: "U"
	},
	{
		name: {
			"default": "Tierra del Fuego",
			alt_en: "Tierra del Fuego Province"
		},
		key: "V"
	},
	{
		name: "Corrientes",
		key: "W"
	},
	{
		name: "Córdoba",
		key: "X"
	},
	{
		name: "Jujuy",
		key: "Y"
	},
	{
		name: {
			"default": "Santa Cruz",
			alt_en: "Santa Cruz Province"
		},
		key: "Z"
	}
];
var AT$2 = [
	{
		name: "Burgenland",
		key: "1"
	},
	{
		name: {
			"default": "Kärnten",
			alt_en: "Carinthia"
		},
		key: "2"
	},
	{
		name: {
			"default": "Niederösterreich",
			alt_en: "Lower Austria"
		},
		key: "3"
	},
	{
		name: {
			"default": "Oberösterreich",
			alt_en: "Upper Austria"
		},
		key: "4"
	},
	{
		name: "Salzburg",
		key: "5"
	},
	{
		name: {
			"default": "Steiermark",
			alt_en: "Styria"
		},
		key: "6"
	},
	{
		name: {
			"default": "Tirol",
			alt_en: "Tyrol"
		},
		key: "7"
	},
	{
		name: "Vorarlberg",
		key: "8"
	},
	{
		name: {
			"default": "Wien",
			alt_en: "Vienna"
		},
		key: "9"
	}
];
var AU$2 = [
	{
		name: "Australian Antarctic Territory",
		key: "AAT"
	},
	{
		name: "Australian Capital Territory",
		key: "ACT"
	},
	{
		name: "Heard Island and McDonald Islands",
		key: "HIMI"
	},
	{
		name: "Jervis Bay Territory",
		key: "JBT"
	},
	{
		name: "New South Wales",
		key: "NSW"
	},
	{
		name: "Northern Territory",
		key: "NT"
	},
	{
		name: "Queensland",
		key: "QLD"
	},
	{
		name: "South Australia",
		key: "SA"
	},
	{
		name: "Tasmania",
		key: "TAS"
	},
	{
		name: "Victoria",
		key: "VIC"
	},
	{
		name: "Western Australia",
		key: "WA"
	}
];
var AZ$2 = [
	{
		name: "Abşeron",
		key: "ABS"
	},
	{
		name: "Ağstafa",
		key: "AGA"
	},
	{
		name: "Ağcabədi",
		key: "AGC"
	},
	{
		name: "Ağdam",
		key: "AGM"
	},
	{
		name: "Ağdaş",
		key: "AGS"
	},
	{
		name: "Ağsu",
		key: "AGU"
	},
	{
		name: "Astara",
		key: "AST"
	},
	{
		name: "Bakı",
		key: "BA"
	},
	{
		name: "Babək",
		key: "BAB"
	},
	{
		name: "Balakən",
		key: "BAL"
	},
	{
		name: "Bərdə",
		key: "BAR"
	},
	{
		name: "Beyləqan",
		key: "BEY"
	},
	{
		name: "Biləsuvar",
		key: "BIL"
	},
	{
		name: "Cəbrayıl",
		key: "CAB"
	},
	{
		name: "Cəlilabad",
		key: "CAL"
	},
	{
		name: "Culfa",
		key: "CUL"
	},
	{
		name: "Daşkəsən",
		key: "DAS"
	},
	{
		name: "Füzuli",
		key: "FUZ"
	},
	{
		name: "Gəncə",
		key: "GA"
	},
	{
		name: "Gədəbəy",
		key: "GAD"
	},
	{
		name: "Goranboy",
		key: "GOR"
	},
	{
		name: "Göyçay",
		key: "GOY"
	},
	{
		name: "Göygöl",
		key: "GYG"
	},
	{
		name: "Hacıqabul",
		key: "HAC"
	},
	{
		name: "İmişli",
		key: "IMI"
	},
	{
		name: "İsmayıllı",
		key: "ISM"
	},
	{
		name: "Kəlbəcər",
		key: "KAL"
	},
	{
		name: "Kǝngǝrli",
		key: "KAN"
	},
	{
		name: "Kürdəmir",
		key: "KUR"
	},
	{
		name: "Lənkəran",
		key: "LA"
	},
	{
		name: "Laçın",
		key: "LAC"
	},
	{
		name: "Lənkəran",
		key: "LAN"
	},
	{
		name: "Lerik",
		key: "LER"
	},
	{
		name: "Masallı",
		key: "MAS"
	},
	{
		name: "Mingəçevir",
		key: "MI"
	},
	{
		name: "Naftalan",
		key: "NA"
	},
	{
		name: "Neftçala",
		key: "NEF"
	},
	{
		name: "Naxçıvan",
		key: "NV"
	},
	{
		name: "Naxçıvan",
		key: "NX"
	},
	{
		name: "Oğuz",
		key: "OGU"
	},
	{
		name: "Ordubad",
		key: "ORD"
	},
	{
		name: "Qəbələ",
		key: "QAB"
	},
	{
		name: "Qax",
		key: "QAX"
	},
	{
		name: "Qazax",
		key: "QAZ"
	},
	{
		name: "Quba",
		key: "QBA"
	},
	{
		name: "Qubadlı",
		key: "QBI"
	},
	{
		name: "Qobustan",
		key: "QOB"
	},
	{
		name: "Qusar",
		key: "QUS"
	},
	{
		name: "Şəki",
		key: "SA"
	},
	{
		name: "Sabirabad",
		key: "SAB"
	},
	{
		name: "Sədərək",
		key: "SAD"
	},
	{
		name: "Şahbuz",
		key: "SAH"
	},
	{
		name: "Şəki",
		key: "SAK"
	},
	{
		name: "Salyan",
		key: "SAL"
	},
	{
		name: "Şərur",
		key: "SAR"
	},
	{
		name: "Saatlı",
		key: "SAT"
	},
	{
		name: "Şabran",
		key: "SBN"
	},
	{
		name: "Siyəzən",
		key: "SIY"
	},
	{
		name: "Şəmkir",
		key: "SKR"
	},
	{
		name: "Sumqayıt",
		key: "SM"
	},
	{
		name: "Şamaxı",
		key: "SMI"
	},
	{
		name: "Samux",
		key: "SMX"
	},
	{
		name: "Şirvan",
		key: "SR"
	},
	{
		name: "Şuşa",
		key: "SUS"
	},
	{
		name: "Tərtər",
		key: "TAR"
	},
	{
		name: "Tovuz",
		key: "TOV"
	},
	{
		name: "Ucar",
		key: "UCA"
	},
	{
		name: "Xankəndi",
		key: "XA"
	},
	{
		name: "Xaçmaz",
		key: "XAC"
	},
	{
		name: "Xocalı",
		key: "XCI"
	},
	{
		name: "Xızı",
		key: "XIZ"
	},
	{
		name: "Xocavənd",
		key: "XVD"
	},
	{
		name: "Yardımlı",
		key: "YAR"
	},
	{
		name: "Yevlax",
		key: "YE"
	},
	{
		name: "Yevlax",
		key: "YEV"
	},
	{
		name: "Zəngilan",
		key: "ZAN"
	},
	{
		name: "Zaqatala",
		key: "ZAQ"
	},
	{
		name: "Zərdab",
		key: "ZAR"
	}
];
var BA$2 = [
	{
		name: "Federacija Bosne i Hercegovine",
		key: "BIH"
	},
	{
		name: "Brčko distrikt",
		key: "BRC"
	},
	{
		name: "Republika Srpska",
		key: "SRP"
	}
];
var BD$2 = [
	{
		name: {
			"default": "বরিশাল বিভাগ",
			alt_en: "Barisal Division"
		},
		key: "A"
	},
	{
		name: {
			"default": "চট্টগ্রাম বিভাগ",
			alt_en: "Chittagong Division"
		},
		key: "B"
	},
	{
		name: {
			"default": "ঢাকা বিভাগ",
			alt_en: "Dhaka Division"
		},
		key: "C"
	},
	{
		name: {
			"default": "খুলনা বিভাগ",
			alt_en: "Khulna Division"
		},
		key: "D"
	},
	{
		name: {
			"default": "রাজশাহী বিভাগ",
			alt_en: "Rajshahi Division"
		},
		key: "E"
	},
	{
		name: {
			"default": "রংপুর বিভাগ",
			alt_en: "Rangpur Division"
		},
		key: "F"
	},
	{
		name: {
			"default": "সিলেট বিভাগ",
			alt_en: "Sylhet Division"
		},
		key: "G"
	}
];
var BE$2 = [
	{
		name: {
			"default": "Bruxelles-Capitale",
			alt_de: "Brüssel-Hauptstadt",
			alt_en: "Brussels-Capital",
			alt_nl: "Brussel-Hoofdstad"
		},
		key: "BRU"
	},
	{
		name: {
			"default": "Antwerpen",
			alt_en: "Antwerp",
			alt_fr: "Anvers"
		},
		key: "VAN"
	},
	{
		name: {
			"default": "Vlaams Brabant",
			alt_de: "Flämisch-Brabant",
			alt_en: "Flemish Brabant",
			alt_fr: "Brabant flamand"
		},
		key: "VBR"
	},
	{
		name: {
			"default": "Limburg",
			alt_fr: "Limbourg"
		},
		key: "VLI"
	},
	{
		name: {
			"default": "Oost-Vlaanderen",
			alt_en: "East Flanders",
			alt_fr: "Flandre orientale"
		},
		key: "VOV"
	},
	{
		name: {
			"default": "West-Vlaanderen",
			alt_de: "Westflandern",
			alt_en: "West Flanders",
			alt_fr: "Flandre-Occidentale"
		},
		key: "VWV"
	},
	{
		name: {
			"default": "Brabant wallon",
			alt_de: "Wallonisch-Brabant",
			alt_en: "Walloon Brabant",
			alt_nl: "Waals-Brabant"
		},
		key: "WBR"
	},
	{
		name: {
			"default": "Hainaut",
			alt_de: "Hennegau",
			alt_nl: "Henegouwen"
		},
		key: "WHT"
	},
	{
		name: {
			"default": "Liège",
			alt_de: "Lüttich",
			alt_nl: "Luik"
		},
		key: "WLG"
	},
	{
		name: {
			"default": "Luxembourg",
			alt_de: "Luxemburg",
			alt_nl: "Luxemburg"
		},
		key: "WLX"
	},
	{
		name: {
			"default": "Namur",
			alt_nl: "Namen"
		},
		key: "WNA"
	}
];
var BF$2 = [
	{
		name: "Balé",
		key: "BAL"
	},
	{
		name: "Bam",
		key: "BAM"
	},
	{
		name: "Banwa",
		key: "BAN"
	},
	{
		name: "Bazèga ga",
		key: "BAZ"
	},
	{
		name: "Bougouriba",
		key: "BGR"
	},
	{
		name: "Boulgou",
		key: "BLG"
	},
	{
		name: "Boulkiemdé",
		key: "BLK"
	},
	{
		name: "Comoé",
		key: "COM"
	},
	{
		name: "Ganzourgou",
		key: "GAN"
	},
	{
		name: "Gnagna",
		key: "GNA"
	},
	{
		name: "Gourma",
		key: "GOU"
	},
	{
		name: "Houet",
		key: "HOU"
	},
	{
		name: "Ioba",
		key: "IOB"
	},
	{
		name: "Kadiogo",
		key: "KAD"
	},
	{
		name: "Kénédougou",
		key: "KEN"
	},
	{
		name: "Komondjari",
		key: "KMD"
	},
	{
		name: "Kompienga",
		key: "KMP"
	},
	{
		name: "Koulpélogo",
		key: "KOP"
	},
	{
		name: "Kossi",
		key: "KOS"
	},
	{
		name: "Kouritenga",
		key: "KOT"
	},
	{
		name: "Kourwéogo",
		key: "KOW"
	},
	{
		name: "Léraba",
		key: "LER"
	},
	{
		name: "Loroum",
		key: "LOR"
	},
	{
		name: "Mouhoun",
		key: "MOU"
	},
	{
		name: "Namentenga",
		key: "NAM"
	},
	{
		name: "Nahouri",
		key: "NAO"
	},
	{
		name: "Nayala",
		key: "NAY"
	},
	{
		name: "Noumbiel",
		key: "NOU"
	},
	{
		name: "Oubritenga",
		key: "OUB"
	},
	{
		name: "Oudalan",
		key: "OUD"
	},
	{
		name: "Passoré",
		key: "PAS"
	},
	{
		name: "Poni",
		key: "PON"
	},
	{
		name: "Séno",
		key: "SEN"
	},
	{
		name: "Sissili",
		key: "SIS"
	},
	{
		name: "Sanmatenga",
		key: "SMT"
	},
	{
		name: "Sanguié",
		key: "SNG"
	},
	{
		name: "Soum",
		key: "SOM"
	},
	{
		name: "Sourou",
		key: "SOR"
	},
	{
		name: "Tapoa",
		key: "TAP"
	},
	{
		name: "Tuy",
		key: "TUI"
	},
	{
		name: "Yagha",
		key: "YAG"
	},
	{
		name: "Yatenga",
		key: "YAT"
	},
	{
		name: "Ziro",
		key: "ZIR"
	},
	{
		name: "Zondoma",
		key: "ZON"
	},
	{
		name: "Zoundwéogo",
		key: "ZOU"
	}
];
var BI$2 = [
	{
		name: "Bubanza",
		key: "BB"
	},
	{
		name: "Bujumbura Rural",
		key: "BL"
	},
	{
		name: "Bujumbura Mairie",
		key: "BM"
	},
	{
		name: "Bururi",
		key: "BR"
	},
	{
		name: "Cankuzo",
		key: "CA"
	},
	{
		name: "Cibitoke",
		key: "CI"
	},
	{
		name: "Gitega",
		key: "GI"
	},
	{
		name: "Kirundo",
		key: "KI"
	},
	{
		name: "Karuzi",
		key: "KR"
	},
	{
		name: "Kayanza",
		key: "KY"
	},
	{
		name: "Makamba",
		key: "MA"
	},
	{
		name: "Muramvya",
		key: "MU"
	},
	{
		name: "Mwaro",
		key: "MW"
	},
	{
		name: "Muyinga",
		key: "MY"
	},
	{
		name: "Ngozi",
		key: "NG"
	},
	{
		name: "Rumonge",
		key: "RM"
	},
	{
		name: "Rutana",
		key: "RT"
	},
	{
		name: "Ruyigi",
		key: "RY"
	}
];
var BJ$2 = [
	{
		name: "Atacora",
		key: "AK"
	},
	{
		name: "Alibori",
		key: "AL"
	},
	{
		name: "Atlantique",
		key: "AQ"
	},
	{
		name: "Borgou",
		key: "BO"
	},
	{
		name: "Collines",
		key: "CO"
	},
	{
		name: "Donga",
		key: "DO"
	},
	{
		name: "Couffo",
		key: "KO"
	},
	{
		name: "Littoral",
		key: "LI"
	},
	{
		name: "Mono",
		key: "MO"
	},
	{
		name: "Ouémé",
		key: "OU"
	},
	{
		name: "Plateau",
		key: "PL"
	},
	{
		name: "Zou",
		key: "ZO"
	}
];
var BN$2 = [
	{
		name: "Belait",
		key: "BE"
	},
	{
		name: "Brunei-Muara",
		key: "BM"
	},
	{
		name: "Temburong",
		key: "TE"
	},
	{
		name: "Tutong",
		key: "TU"
	}
];
var BO$2 = [
	{
		name: "El Beni",
		key: "B"
	},
	{
		name: "Cochabamba",
		key: "C"
	},
	{
		name: "Chuquisaca",
		key: "H"
	},
	{
		name: "La Paz",
		key: "L"
	},
	{
		name: "Pando",
		key: "N"
	},
	{
		name: "Oruro",
		key: "O"
	},
	{
		name: "Potosí",
		key: "P"
	},
	{
		name: "Santa Cruz",
		key: "S"
	},
	{
		name: "Tarija",
		key: "T"
	}
];
var BR$2 = [
	{
		name: "Acre",
		key: "AC"
	},
	{
		name: "Alagoas",
		key: "AL"
	},
	{
		name: "Amazonas",
		key: "AM"
	},
	{
		name: "Amapá",
		key: "AP"
	},
	{
		name: "Bahia",
		key: "BA"
	},
	{
		name: "Ceará",
		key: "CE"
	},
	{
		name: "Distrito Federal",
		key: "DF"
	},
	{
		name: "Espírito Santo",
		key: "ES"
	},
	{
		name: "Goiás",
		key: "GO"
	},
	{
		name: "Maranhão",
		key: "MA"
	},
	{
		name: "Minas Gerais",
		key: "MG"
	},
	{
		name: "Mato Grosso do Sul",
		key: "MS"
	},
	{
		name: "Mato Grosso",
		key: "MT"
	},
	{
		name: "Pará",
		key: "PA"
	},
	{
		name: "Paraíba",
		key: "PB"
	},
	{
		name: "Pernambuco",
		key: "PE"
	},
	{
		name: "Piauí",
		key: "PI"
	},
	{
		name: "Paraná",
		key: "PR"
	},
	{
		name: "Rio de Janeiro",
		key: "RJ"
	},
	{
		name: "Rio Grande do Norte",
		key: "RN"
	},
	{
		name: "Rondônia",
		key: "RO"
	},
	{
		name: "Roraima",
		key: "RR"
	},
	{
		name: "Rio Grande do Sul",
		key: "RS"
	},
	{
		name: "Santa Catarina",
		key: "SC"
	},
	{
		name: "Sergipe",
		key: "SE"
	},
	{
		name: "São Paulo",
		key: "SP"
	},
	{
		name: "Tocantins",
		key: "TO"
	}
];
var BW$2 = [
	{
		name: "Central",
		key: "CE"
	},
	{
		name: "Chobe",
		key: "CH"
	},
	{
		name: "Francistown",
		key: "FR"
	},
	{
		name: "Gaborone",
		key: "GA"
	},
	{
		name: "Ghanzi",
		key: "GH"
	},
	{
		name: "Jwaneng",
		key: "JW"
	},
	{
		name: "Kgalagadi",
		key: "KG"
	},
	{
		name: "Kgatleng",
		key: "KL"
	},
	{
		name: "Kweneng",
		key: "KW"
	},
	{
		name: "Lobatse",
		key: "LO"
	},
	{
		name: "North East",
		key: "NE"
	},
	{
		name: "North West",
		key: "NW"
	},
	{
		name: "South East",
		key: "SE"
	},
	{
		name: "Southern",
		key: "SO"
	},
	{
		name: "Selibe Phikwe",
		key: "SP"
	},
	{
		name: "Sowa Town",
		key: "ST"
	}
];
var BY$2 = [
	{
		name: {
			"default": "Брестская область",
			alt_en: "Brest Region"
		},
		key: "BR"
	},
	{
		name: {
			"default": "Минск",
			alt_en: "Minsk"
		},
		key: "HM"
	},
	{
		name: {
			"default": "Гомельская область",
			alt_en: "Homel Region"
		},
		key: "HO"
	},
	{
		name: {
			"default": "Гродненская область",
			alt_en: "Grodno Region"
		},
		key: "HR"
	},
	{
		name: {
			"default": "Могилёвская область",
			alt_en: "Mahilyow Region"
		},
		key: "MA"
	},
	{
		name: {
			"default": "Минская область",
			alt_en: "Minsk Region"
		},
		key: "MI"
	},
	{
		name: {
			"default": "Витебская область",
			alt_en: "Vitsebsk Region"
		},
		key: "VI"
	}
];
var BZ$2 = [
	{
		name: "Belize District",
		key: "BZ"
	},
	{
		name: "Cayo",
		key: "CY"
	},
	{
		name: "Corozal",
		key: "CZL"
	},
	{
		name: "Orange Walk",
		key: "OW"
	},
	{
		name: "Stann Creek",
		key: "SC"
	},
	{
		name: "Toledo",
		key: "TOL"
	}
];
var CA$3 = [
	{
		name: "Alberta",
		key: "AB"
	},
	{
		name: {
			"default": "British Columbia",
			alt_fr: "Colombie-Britannique"
		},
		key: "BC"
	},
	{
		name: "Manitoba",
		key: "MB"
	},
	{
		name: {
			"default": "New Brunswick",
			alt_fr: "Nouveau-Brunswick"
		},
		key: "NB"
	},
	{
		name: {
			"default": "Newfoundland and Labrador",
			alt_fr: "Terre-Neuve-et-Labrador"
		},
		key: "NL"
	},
	{
		name: {
			"default": "Northwest Territories",
			alt_fr: "Territoires du Nord-Ouest"
		},
		key: "NT"
	},
	{
		name: {
			"default": "Nova Scotia",
			alt_fr: "Nouvelle-Écosse"
		},
		key: "NS"
	},
	{
		name: "Nunavut",
		key: "NU"
	},
	{
		name: "Ontario",
		key: "ON"
	},
	{
		name: {
			"default": "Prince Edward Island",
			alt_fr: "Île-du-Prince-Édouard"
		},
		key: "PE"
	},
	{
		name: {
			"default": "Quebec",
			alt_fr: "Québec"
		},
		key: "QC"
	},
	{
		name: "Saskatchewan",
		key: "SK"
	},
	{
		name: "Yukon",
		key: "YT"
	}
];
var CD$2 = [
	{
		name: "Kongo Central",
		key: "BC"
	},
	{
		name: "Bas-Uélé",
		key: "BU"
	},
	{
		name: "Équateur",
		key: "EQ"
	},
	{
		name: "Haut-Katanga",
		key: "HK"
	},
	{
		name: "Haut-Lomami",
		key: "HL"
	},
	{
		name: "Haut-Uélé",
		key: "HU"
	},
	{
		name: "Ituri",
		key: "IT"
	},
	{
		name: "Kasaï Central",
		key: "KC"
	},
	{
		name: "Kasaï Oriental",
		key: "KE"
	},
	{
		name: "Kwango",
		key: "KG"
	},
	{
		name: "Kwilu",
		key: "KL"
	},
	{
		name: "Kinshasa",
		key: "KN"
	},
	{
		name: "Kasaï",
		key: "KS"
	},
	{
		name: "Lomami",
		key: "LO"
	},
	{
		name: "Lualaba",
		key: "LU"
	},
	{
		name: "Maniema",
		key: "MA"
	},
	{
		name: "Mai-Ndombe",
		key: "MN"
	},
	{
		name: "Mongala",
		key: "MO"
	},
	{
		name: "Nord-Kivu",
		key: "NK"
	},
	{
		name: "Nord-Ubangi",
		key: "NU"
	},
	{
		name: "Sankuru",
		key: "SA"
	},
	{
		name: "Sud-Kivu",
		key: "SK"
	},
	{
		name: "Sud-Ubangi",
		key: "SU"
	},
	{
		name: "Tanganyika",
		key: "TA"
	},
	{
		name: "Tshopo",
		key: "TO"
	},
	{
		name: "Tshuapa",
		key: "TU"
	}
];
var CF$2 = [
	{
		name: "Ouham",
		key: "AC"
	},
	{
		name: "Bamingui-Bangoran",
		key: "BB"
	},
	{
		name: "Bangui",
		key: "BGF"
	},
	{
		name: "Basse-Kotto",
		key: "BK"
	},
	{
		name: "Haute-Kotto",
		key: "HK"
	},
	{
		name: "Haut-Mbomou",
		key: "HM"
	},
	{
		name: "Mambéré-Kadéï",
		key: "HS"
	},
	{
		name: "Gribingui",
		key: "KB"
	},
	{
		name: "Kémo‐Gribingui",
		key: "KG"
	},
	{
		name: "Lobaye",
		key: "LB"
	},
	{
		name: "Mbomou",
		key: "MB"
	},
	{
		name: "Ombella-Mpoko",
		key: "MP"
	},
	{
		name: "Nana-Mambéré",
		key: "NM"
	},
	{
		name: "Ouham-Pendé",
		key: "OP"
	},
	{
		name: "Sangha",
		key: "SE"
	},
	{
		name: "Ouaka",
		key: "UK"
	},
	{
		name: "Vakaga",
		key: "VK"
	}
];
var CH$2 = [
	{
		name: {
			"default": "Aargau",
			alt_fr: "Argovie",
			alt_it: "Argovia"
		},
		key: "AG"
	},
	{
		name: {
			"default": "Appenzell Innerrhoden",
			alt_fr: "Appenzell Rhodes-Intérieures",
			alt_it: "Appenzello Interno"
		},
		key: "AI"
	},
	{
		name: {
			"default": "Appenzell Ausserrhoden",
			alt_fr: "Appenzell Rhodes-Extérieures",
			alt_it: "Appenzello Esterno"
		},
		key: "AR"
	},
	{
		name: {
			"default": "Bern",
			alt_fr: "Berne",
			alt_it: "Berna"
		},
		key: "BE"
	},
	{
		name: {
			"default": "Basel-Landschaft",
			alt_fr: "Bâle-Campagne",
			alt_it: "Basilea Campagna"
		},
		key: "BL"
	},
	{
		name: {
			"default": "Basel-Stadt",
			alt_en: "Basel-City",
			alt_fr: "Bâle-Ville",
			alt_it: "Basilea Città"
		},
		key: "BS"
	},
	{
		name: {
			"default": "Fribourg",
			alt_de: "Freiburg",
			alt_it: "Friburgo"
		},
		key: "FR"
	},
	{
		name: {
			"default": "Geneva",
			alt_de: "Genf",
			alt_fr: "Genève",
			alt_it: "Ginevra"
		},
		key: "GE"
	},
	{
		name: {
			"default": "Glarus",
			alt_fr: "Glaris",
			alt_it: "Glarona"
		},
		key: "GL"
	},
	{
		name: {
			"default": "Graubünden",
			alt_en: "Grisons",
			alt_fr: "Grisons",
			alt_it: "Grigioni"
		},
		key: "GR"
	},
	{
		name: {
			"default": "Jura",
			alt_it: "Giura"
		},
		key: "JU"
	},
	{
		name: {
			"default": "Luzern",
			alt_fr: "Lucerne",
			alt_it: "Lucerna"
		},
		key: "LU"
	},
	{
		name: {
			"default": "Neuchâtel",
			alt_de: "Neuenburg"
		},
		key: "NE"
	},
	{
		name: {
			"default": "Nidwalden",
			alt_fr: "Nidwald",
			alt_it: "Nidvaldo"
		},
		key: "NW"
	},
	{
		name: {
			"default": "Obwalden",
			alt_fr: "Obwald",
			alt_it: "Obvaldo"
		},
		key: "OW"
	},
	{
		name: {
			"default": "Sankt Gallen",
			alt_fr: "Saint-Gall",
			alt_it: "San Gallo"
		},
		key: "SG"
	},
	{
		name: {
			"default": "Schaffhausen",
			alt_fr: "Schaffhouse",
			alt_it: "Sciaffusa"
		},
		key: "SH"
	},
	{
		name: {
			"default": "Solothurn",
			alt_fr: "Soleure",
			alt_it: "Soletta"
		},
		key: "SO"
	},
	{
		name: {
			"default": "Schwyz",
			alt_it: "Svitto"
		},
		key: "SZ"
	},
	{
		name: {
			"default": "Thurgau",
			alt_fr: "Thurgovie",
			alt_it: "Turgovia"
		},
		key: "TG"
	},
	{
		name: {
			"default": "Ticino",
			alt_de: "Tessin",
			alt_fr: "Tessin"
		},
		key: "TI"
	},
	{
		name: "Uri",
		key: "UR"
	},
	{
		name: {
			"default": "Vaud",
			alt_de: "Waadt"
		},
		key: "VD"
	},
	{
		name: {
			"default": "Valais/Wallis",
			alt_de: "Wallis",
			alt_fr: "Valais",
			alt_it: "Vallese"
		},
		key: "VS"
	},
	{
		name: {
			"default": "Zug",
			alt_fr: "Zoug",
			alt_it: "Zugo"
		},
		key: "ZG"
	},
	{
		name: {
			"default": "Zürich",
			alt_en: "Zurich",
			alt_fr: "Zurich",
			alt_it: "Zurigo"
		},
		key: "ZH"
	}
];
var CI$2 = [
	{
		name: "Abidjan",
		key: "AB"
	},
	{
		name: "Bas-Sassandra",
		key: "BS"
	},
	{
		name: "Comoé",
		key: "CM"
	},
	{
		name: "Denguélé",
		key: "DN"
	},
	{
		name: "Gôh-Djiboua",
		key: "GD"
	},
	{
		name: "Lacs",
		key: "LC"
	},
	{
		name: "Lagunes",
		key: "LG"
	},
	{
		name: "Montagnes",
		key: "MG"
	},
	{
		name: "Sassandra-Marahoué",
		key: "SM"
	},
	{
		name: "Savanes",
		key: "SV"
	},
	{
		name: "Vallée du Bandama",
		key: "VB"
	},
	{
		name: "Woroba",
		key: "WR"
	},
	{
		name: "Yamoussoukro",
		key: "YM"
	},
	{
		name: "Zanzan",
		key: "ZZ"
	}
];
var CL$2 = [
	{
		name: "Aisén del General Carlos Ibañez del Campo",
		key: "AI"
	},
	{
		name: "Antofagasta",
		key: "AN"
	},
	{
		name: "Arica y Parinacota",
		key: "AP"
	},
	{
		name: "La Araucanía",
		key: "AR"
	},
	{
		name: "Atacama",
		key: "AT"
	},
	{
		name: "Biobío",
		key: "BI"
	},
	{
		name: "Coquimbo",
		key: "CO"
	},
	{
		name: "Libertador General Bernardo O'Higgins",
		key: "LI"
	},
	{
		name: "Los Lagos",
		key: "LL"
	},
	{
		name: "Los Ríos",
		key: "LR"
	},
	{
		name: "Magallanes",
		key: "MA"
	},
	{
		name: "Maule",
		key: "ML"
	},
	{
		name: "Región Metropolitana de Santiago",
		key: "RM"
	},
	{
		name: "Tarapacá",
		key: "TA"
	},
	{
		name: "Valparaíso",
		key: "VS"
	}
];
var CM$2 = [
	{
		name: "Adamaoua",
		key: "AD"
	},
	{
		name: "Centre",
		key: "CE"
	},
	{
		name: "Far North",
		key: "EN"
	},
	{
		name: "East",
		key: "ES"
	},
	{
		name: "Littoral",
		key: "LT"
	},
	{
		name: "North",
		key: "NO"
	},
	{
		name: "North-West",
		key: "NW"
	},
	{
		name: "West",
		key: "OU"
	},
	{
		name: "South",
		key: "SU"
	},
	{
		name: "South-West",
		key: "SW"
	}
];
var CO$2 = [
	{
		name: "Amazonas",
		key: "AMA"
	},
	{
		name: "Antioquia",
		key: "ANT"
	},
	{
		name: "Arauca",
		key: "ARA"
	},
	{
		name: "Atlántico",
		key: "ATL"
	},
	{
		name: "Bolívar",
		key: "BOL"
	},
	{
		name: "Boyacá",
		key: "BOY"
	},
	{
		name: "Caldas",
		key: "CAL"
	},
	{
		name: "Caquetá",
		key: "CAQ"
	},
	{
		name: "Casanare",
		key: "CAS"
	},
	{
		name: "Cauca",
		key: "CAU"
	},
	{
		name: "Cesar",
		key: "CES"
	},
	{
		name: "Chocó",
		key: "CHO"
	},
	{
		name: "Córdoba",
		key: "COR"
	},
	{
		name: "Cundinamarca",
		key: "CUN"
	},
	{
		name: "Distrito Capital de Bogotá",
		key: "DC"
	},
	{
		name: "Guainía",
		key: "GUA"
	},
	{
		name: "Guaviare",
		key: "GUV"
	},
	{
		name: "Huila",
		key: "HUI"
	},
	{
		name: "La Guajira",
		key: "LAG"
	},
	{
		name: "Magdalena",
		key: "MAG"
	},
	{
		name: "Meta",
		key: "MET"
	},
	{
		name: "Nariño",
		key: "NAR"
	},
	{
		name: "Norte de Santander",
		key: "NSA"
	},
	{
		name: "Putumayo",
		key: "PUT"
	},
	{
		name: "Quindío",
		key: "QUI"
	},
	{
		name: "Risaralda",
		key: "RIS"
	},
	{
		name: "Santander",
		key: "SAN"
	},
	{
		name: "San Andrés",
		key: "SAP"
	},
	{
		name: "Sucre",
		key: "SUC"
	},
	{
		name: "Tolima",
		key: "TOL"
	},
	{
		name: "Valle del Cauca",
		key: "VAC"
	},
	{
		name: "Vaupés",
		key: "VAU"
	},
	{
		name: "Vichada",
		key: "VID"
	}
];
var CR$2 = [
	{
		name: "Alajuela",
		key: "A"
	},
	{
		name: "Cartago",
		key: "C"
	},
	{
		name: "Guanacaste",
		key: "G"
	},
	{
		name: "Heredia",
		key: "H"
	},
	{
		name: "Limón",
		key: "L"
	},
	{
		name: "Puntarenas",
		key: "P"
	},
	{
		name: "San José",
		key: "SJ"
	}
];
var CV$2 = [
	{
		name: "Brava",
		key: "BR"
	},
	{
		name: "Boa Vista",
		key: "BV"
	},
	{
		name: "Santa Catarina",
		key: "CA"
	},
	{
		name: "Santa Catarina do Fogo",
		key: "CF"
	},
	{
		name: "Santa Cruz",
		key: "CR"
	},
	{
		name: "Maio",
		key: "MA"
	},
	{
		name: "Mosteiros",
		key: "MO"
	},
	{
		name: "Paul",
		key: "PA"
	},
	{
		name: "Porto Novo",
		key: "PN"
	},
	{
		name: "Praia",
		key: "PR"
	},
	{
		name: "Ribeira Brava",
		key: "RB"
	},
	{
		name: "Ribeira Grande",
		key: "RG"
	},
	{
		name: "Ribeira Grande de Santiago",
		key: "RS"
	},
	{
		name: "São Domingos",
		key: "SD"
	},
	{
		name: "São Filipe",
		key: "SF"
	},
	{
		name: "Sal",
		key: "SL"
	},
	{
		name: "São Miguel",
		key: "SM"
	},
	{
		name: "São Lourenço dos Órgãos",
		key: "SO"
	},
	{
		name: "São Salvador do Mundo",
		key: "SS"
	},
	{
		name: "São Vicente",
		key: "SV"
	},
	{
		name: "Tarrafal",
		key: "TA"
	},
	{
		name: "Tarrafal de São Nicolau",
		key: "TS"
	}
];
var DE$3 = [
	{
		name: "Brandenburg",
		key: "BB"
	},
	{
		name: "Berlin",
		key: "BE"
	},
	{
		name: "Baden-Württemberg",
		key: "BW"
	},
	{
		name: {
			"default": "Bayern",
			alt_en: "Bavaria"
		},
		key: "BY"
	},
	{
		name: "Bremen",
		key: "HB"
	},
	{
		name: {
			"default": "Hessen",
			alt_en: "Hesse"
		},
		key: "HE"
	},
	{
		name: "Hamburg",
		key: "HH"
	},
	{
		name: "Mecklenburg-Vorpommern",
		key: "MV"
	},
	{
		name: {
			"default": "Niedersachsen",
			alt_en: "Lower Saxony"
		},
		key: "NI"
	},
	{
		name: {
			"default": "Nordrhein-Westfalen",
			alt_en: "North Rhine-Westphalia"
		},
		key: "NW"
	},
	{
		name: {
			"default": "Rheinland-Pfalz",
			alt_en: "Rhineland-Palatinate"
		},
		key: "RP"
	},
	{
		name: "Schleswig-Holstein",
		key: "SH"
	},
	{
		name: "Saarland",
		key: "SL"
	},
	{
		name: {
			"default": "Sachsen",
			alt_en: "Saxony"
		},
		key: "SN"
	},
	{
		name: {
			"default": "Sachsen-Anhalt",
			alt_en: "Saxony-Anhalt"
		},
		key: "ST"
	},
	{
		name: {
			"default": "Thüringen",
			alt_en: "Thuringia"
		},
		key: "TH"
	}
];
var DJ$2 = [
	{
		name: "Arta",
		key: "AR"
	},
	{
		name: "Ali Sabieh",
		key: "AS"
	},
	{
		name: "Dikhil",
		key: "DI"
	},
	{
		name: "Djibouti",
		key: "DJ"
	},
	{
		name: "Obock",
		key: "OB"
	},
	{
		name: "Tadjourah",
		key: "TA"
	}
];
var EC$2 = [
	{
		name: "Azuay",
		key: "A"
	},
	{
		name: "Bolívar",
		key: "B"
	},
	{
		name: "Carchi",
		key: "C"
	},
	{
		name: "Orellana",
		key: "D"
	},
	{
		name: "Esmeraldas",
		key: "E"
	},
	{
		name: "Cañar",
		key: "F"
	},
	{
		name: "Guayas",
		key: "G"
	},
	{
		name: "Chimborazo",
		key: "H"
	},
	{
		name: "Imbabura",
		key: "I"
	},
	{
		name: "Loja",
		key: "L"
	},
	{
		name: "Manabí",
		key: "M"
	},
	{
		name: "Napo",
		key: "N"
	},
	{
		name: "El Oro",
		key: "O"
	},
	{
		name: "Pichincha",
		key: "P"
	},
	{
		name: "Los Ríos",
		key: "R"
	},
	{
		name: "Morona-Santiago",
		key: "S"
	},
	{
		name: "Santo Domingo de los Tsáchilas",
		key: "SD"
	},
	{
		name: "Santa Elena",
		key: "SE"
	},
	{
		name: "Tungurahua",
		key: "T"
	},
	{
		name: "Sucumbíos",
		key: "U"
	},
	{
		name: "Galápagos",
		key: "W"
	},
	{
		name: "Cotopaxi",
		key: "X"
	},
	{
		name: "Pastaza",
		key: "Y"
	},
	{
		name: "Zamora Chinchipe",
		key: "Z"
	}
];
var ER$2 = [
	{
		name: {
			"default": "ዞባ ዓንሰባ Anseba عنسبا",
			alt_ar: "عنسبا",
			alt_en: "Anseba",
			alt_ti: "ዞባ ዓንሰባ"
		},
		key: "AN"
	},
	{
		name: {
			"default": "ዞባ ደቡባዊ ቀይሕ ባሕሪ southern Red Sea Zone جنوب البحر الأحمر",
			alt_ar: "جنوب البحر الأحمر",
			alt_en: "Southern Red Sea Region",
			alt_ti: "ዞባ ደቡባዊ ቀይሕ ባሕሪ"
		},
		key: "DK"
	},
	{
		name: {
			"default": "ዞባ ደቡብ Debub منطقة الجنوب",
			alt_ar: "منطقة الجنوب",
			alt_en: "Debub Region",
			alt_ti: "ዞባ ደቡብ"
		},
		key: "DU"
	},
	{
		name: {
			"default": "ጋሽ-ባርካ Gash barka القاش وبركة",
			alt_ar: "القاش وبركة",
			alt_en: "Gash-Barka",
			alt_ti: "ጋሽ-ባርካ"
		},
		key: "GB"
	},
	{
		name: {
			"default": "ዞባ ማእከል Maekel zone المنطقة المركزية",
			alt_ar: "المنطقة المركزية",
			alt_en: "Maekel Region",
			alt_ti: "ዞባ ማእከል"
		},
		key: "MA"
	},
	{
		name: {
			"default": "ዞባ ሰሜናዊ ቀይሕ ባሕሪ Northern Red Sea zone شمال البحر الأحمر",
			alt_ar: "شمال البحر الأحمر",
			alt_en: "Northen Red Sea Region",
			alt_ti: "ዞባ ሰሜናዊ ቀይሕ ባሕሪ"
		},
		key: "SK"
	}
];
var ES$4 = [
	{
		name: {
			"default": "Andalucía",
			alt_en: "Andalusia"
		},
		key: "AN"
	},
	{
		name: {
			"default": "Aragón",
			alt_en: "Aragon"
		},
		key: "AR"
	},
	{
		name: "Asturias",
		key: "AS"
	},
	{
		name: "Cantabria",
		key: "CB"
	},
	{
		name: "Ceuta",
		key: "CE"
	},
	{
		name: {
			"default": "Castilla y León",
			alt_en: "Castile and León"
		},
		key: "CL"
	},
	{
		name: {
			"default": "Castilla-La Mancha",
			alt_en: "Castile-La Mancha"
		},
		key: "CM"
	},
	{
		name: {
			"default": "Canarias",
			alt_en: "Canary Islands"
		},
		key: "CN"
	},
	{
		name: {
			"default": "Cataluña",
			alt_ca: "Catalunya",
			alt_en: "Catalonia"
		},
		key: "CT"
	},
	{
		name: "Extremadura",
		key: "EX"
	},
	{
		name: "Galicia",
		key: "GA"
	},
	{
		name: {
			"default": "Islas Baleares",
			alt_en: "Balearic Islands"
		},
		key: "IB"
	},
	{
		name: {
			"default": "Región de Murcia",
			alt_en: "Region of Murcia"
		},
		key: "MC"
	},
	{
		name: {
			"default": "Comunidad de Madrid",
			alt_en: "Community of Madrid"
		},
		key: "MD"
	},
	{
		name: "Melilla",
		key: "ML"
	},
	{
		name: "Navarra",
		key: "NC"
	},
	{
		name: {
			"default": "País Vasco",
			alt_en: "Autonomous Community of the Basque Country",
			alt_eu: "Euskadi"
		},
		key: "PV"
	},
	{
		name: {
			"default": "La Rioja",
			alt_en: "Rioja"
		},
		key: "RI"
	},
	{
		name: {
			"default": "Comunidad Valenciana",
			alt_en: "Valencian Community"
		},
		key: "VC"
	}
];
var FJ$2 = [
	{
		name: "Central",
		key: "C"
	},
	{
		name: "Eastern",
		key: "E"
	},
	{
		name: "Northern",
		key: "N"
	},
	{
		name: "Western",
		key: "W"
	}
];
var FM$2 = [
	{
		name: "Kosrae",
		key: "KSA"
	},
	{
		name: "Pohnpei",
		key: "PNI"
	},
	{
		name: "Chuuk",
		key: "TRK"
	},
	{
		name: "Yap",
		key: "YAP"
	}
];
var FR$3 = [
	{
		name: "Auvergne-Rhône-Alpes",
		key: "ARA"
	},
	{
		name: "Bourgogne-Franche-Comté",
		key: "BFC"
	},
	{
		name: {
			"default": "Bretagne",
			alt_en: "Brittany"
		},
		key: "BRE"
	},
	{
		name: "Centre-Val de Loire",
		key: "CVL"
	},
	{
		name: {
			"default": "Corse",
			alt_en: "Corsica"
		},
		key: "COR"
	},
	{
		name: "Grand Est",
		key: "GES"
	},
	{
		name: "Guyane",
		key: "GF"
	},
	{
		name: "Guadeloupe",
		key: "GP"
	},
	{
		name: "Hauts-de-France",
		key: "HDF"
	},
	{
		name: {
			"default": "Île-de-France",
			alt_en: "Ile-de-France"
		},
		key: "IDF"
	},
	{
		name: "Martinique",
		key: "MQ"
	},
	{
		name: {
			"default": "Normandie",
			alt_en: "Normandy"
		},
		key: "NOR"
	},
	{
		name: {
			"default": "Nouvelle-Aquitaine",
			alt_en: "New Aquitaine"
		},
		key: "NAQ"
	},
	{
		name: {
			"default": "Occitanie",
			alt_en: "Occitania"
		},
		key: "OCC"
	},
	{
		name: "Pays de la Loire",
		key: "PDL"
	},
	{
		name: "Provence-Alpes-Côte d'Azur",
		key: "PAC"
	},
	{
		name: "La Réunion",
		key: "RE"
	},
	{
		name: "Mayotte",
		key: "YT"
	}
];
var GB$3 = [
	{
		name: "England",
		key: "ENG"
	},
	{
		name: "Northern Ireland",
		key: "NIR"
	},
	{
		name: "Scotland",
		key: "SCT"
	},
	{
		name: "Wales",
		key: "WLS"
	}
];
var GE$2 = [
	{
		name: {
			"default": "აფხაზეთის ავტონომიური რესპუბლიკა - Аҧсны Автономтә Республика",
			alt_en: "Autonomous Republic of Abkhazia"
		},
		key: "AB"
	},
	{
		name: {
			"default": "აჭარის ავტონომიური რესპუბლიკა",
			alt_en: "Autonomous Republic of Adjara"
		},
		key: "AJ"
	},
	{
		name: {
			"default": "გურია",
			alt_en: "Guria"
		},
		key: "GU"
	},
	{
		name: {
			"default": "იმერეთი",
			alt_en: "Imereti"
		},
		key: "IM"
	},
	{
		name: {
			"default": "კახეთი",
			alt_en: "Kakheti"
		},
		key: "KA"
	},
	{
		name: {
			"default": "ქვემო ქართლი",
			alt_en: "Lower Kartli"
		},
		key: "KK"
	},
	{
		name: {
			"default": "მცხეთა-მთიანეთი",
			alt_en: "Mtskheta-Mtianeti"
		},
		key: "MM"
	},
	{
		name: {
			"default": "რაჭა-ლეჩხუმი და ქვემო სვანეთი",
			alt_en: "Racha-Lechkhumi and Lower Svaneti"
		},
		key: "RL"
	},
	{
		name: {
			"default": "სამცხე-ჯავახეთი",
			alt_en: "Samtskhe-Javakheti"
		},
		key: "SJ"
	},
	{
		name: {
			"default": "შიდა ქართლი",
			alt_en: "Inner Kartli"
		},
		key: "SK"
	},
	{
		name: {
			"default": "სამეგრელო-ზემო სვანეთი",
			alt_en: "Samegrelo-Upper Svaneti"
		},
		key: "SZ"
	},
	{
		name: {
			"default": "თბილისი",
			alt_en: "Tbilisi"
		},
		key: "TB"
	}
];
var GH$2 = [
	{
		name: "Greater Accra",
		key: "AA"
	},
	{
		name: "Ashanti",
		key: "AH"
	},
	{
		name: "Brong-Ahafo",
		key: "BA"
	},
	{
		name: "Central",
		key: "CP"
	},
	{
		name: "Eastern",
		key: "EP"
	},
	{
		name: "Northern",
		key: "NP"
	},
	{
		name: "Volta",
		key: "TV"
	},
	{
		name: "Upper East",
		key: "UE"
	},
	{
		name: "Upper West",
		key: "UW"
	},
	{
		name: "Western",
		key: "WP"
	}
];
var GL$3 = [
	{
		name: "Kommune Kujalleq",
		key: "KU"
	},
	{
		name: "Qaasuitsup Kommunia",
		key: "QA"
	},
	{
		name: "Qeqqata Kommunia",
		key: "QE"
	},
	{
		name: "Kommuneqarfik Sermersooq",
		key: "SM"
	}
];
var GM$2 = [
	{
		name: "Banjul",
		key: "B"
	},
	{
		name: "Lower River",
		key: "L"
	},
	{
		name: "Central River",
		key: "M"
	},
	{
		name: "North Bank",
		key: "N"
	},
	{
		name: "Upper River",
		key: "U"
	},
	{
		name: "Western",
		key: "W"
	}
];
var GN$2 = [
	{
		name: "Beyla",
		key: "BE"
	},
	{
		name: "Boffa",
		key: "BF"
	},
	{
		name: "Boké",
		key: "BK"
	},
	{
		name: "Coyah",
		key: "CO"
	},
	{
		name: "Dabola",
		key: "DB"
	},
	{
		name: "Dinguiraye",
		key: "DI"
	},
	{
		name: "Dalaba",
		key: "DL"
	},
	{
		name: "Dubréka",
		key: "DU"
	},
	{
		name: "Faranah",
		key: "FA"
	},
	{
		name: "Forécariah",
		key: "FO"
	},
	{
		name: "Fria",
		key: "FR"
	},
	{
		name: "Gaoual",
		key: "GA"
	},
	{
		name: "Guékédou",
		key: "GU"
	},
	{
		name: "Kankan",
		key: "KA"
	},
	{
		name: "Koubia",
		key: "KB"
	},
	{
		name: "Kindia",
		key: "KD"
	},
	{
		name: "Kérouané",
		key: "KE"
	},
	{
		name: "Koundara",
		key: "KN"
	},
	{
		name: "Kouroussa",
		key: "KO"
	},
	{
		name: "Kissidougou",
		key: "KS"
	},
	{
		name: "Labé",
		key: "LA"
	},
	{
		name: "Lélouma",
		key: "LE"
	},
	{
		name: "Lola",
		key: "LO"
	},
	{
		name: "Macenta",
		key: "MC"
	},
	{
		name: "Mandiana",
		key: "MD"
	},
	{
		name: "Mali",
		key: "ML"
	},
	{
		name: "Mamou",
		key: "MM"
	},
	{
		name: "Nzérékoré",
		key: "NZ"
	},
	{
		name: "Pita",
		key: "PI"
	},
	{
		name: "Siguiri",
		key: "SI"
	},
	{
		name: "Télimélé",
		key: "TE"
	},
	{
		name: "Tougué",
		key: "TO"
	},
	{
		name: "Yomou",
		key: "YO"
	}
];
var GQ$2 = [
	{
		name: "Annobón",
		key: "AN"
	},
	{
		name: "Bioko Norte",
		key: "BN"
	},
	{
		name: "Bioko Sur",
		key: "BS"
	},
	{
		name: "Centro Sur",
		key: "CS"
	},
	{
		name: "Kié‐Ntem",
		key: "KN"
	},
	{
		name: "Litoral",
		key: "LI"
	},
	{
		name: "Wele‐Nzas",
		key: "WN"
	}
];
var GT$2 = [
	{
		name: "Alta Verapaz",
		key: "AV"
	},
	{
		name: "Baja Verapaz",
		key: "BV"
	},
	{
		name: "Chimaltenango",
		key: "CM"
	},
	{
		name: "Chiquimula",
		key: "CQ"
	},
	{
		name: "Escuintla",
		key: "ES"
	},
	{
		name: "Guatemala",
		key: "GU"
	},
	{
		name: "Huehuetenango",
		key: "HU"
	},
	{
		name: "Izabal",
		key: "IZ"
	},
	{
		name: "Jalapa",
		key: "JA"
	},
	{
		name: "Jutiapa",
		key: "JU"
	},
	{
		name: "Petén",
		key: "PE"
	},
	{
		name: "El Progreso",
		key: "PR"
	},
	{
		name: "Quiché",
		key: "QC"
	},
	{
		name: "Quetzaltenango",
		key: "QZ"
	},
	{
		name: "Retalhuleu",
		key: "RE"
	},
	{
		name: "Sacatepéquez",
		key: "SA"
	},
	{
		name: "San Marcos",
		key: "SM"
	},
	{
		name: "Sololá",
		key: "SO"
	},
	{
		name: "Santa Rosa",
		key: "SR"
	},
	{
		name: "Suchitepéquez",
		key: "SU"
	},
	{
		name: "Totonicapán",
		key: "TO"
	},
	{
		name: "Zacapa",
		key: "ZA"
	}
];
var GW$2 = [
	{
		name: "Bafatá",
		key: "BA"
	},
	{
		name: "Bolama",
		key: "BL"
	},
	{
		name: "Biombo",
		key: "BM"
	},
	{
		name: "Bissau",
		key: "BS"
	},
	{
		name: "Cacheu",
		key: "CA"
	},
	{
		name: "Gabú",
		key: "GA"
	},
	{
		name: "Oio",
		key: "OI"
	},
	{
		name: "Quinara",
		key: "QU"
	},
	{
		name: "Tombali",
		key: "TO"
	}
];
var GY$2 = [
	{
		name: "Barima-Waini",
		key: "BA"
	},
	{
		name: "Cuyuni-Mazaruni",
		key: "CU"
	},
	{
		name: "Demerara-Mahaica",
		key: "DE"
	},
	{
		name: "East Berbice-Corentyne",
		key: "EB"
	},
	{
		name: "Essequibo Islands-West Demerara",
		key: "ES"
	},
	{
		name: "Mahaica-Berbice",
		key: "MA"
	},
	{
		name: "Pomeroon-Supenaam",
		key: "PM"
	},
	{
		name: "Potaro-Siparuni",
		key: "PT"
	},
	{
		name: "Upper Demerara-Berbice",
		key: "UD"
	},
	{
		name: "Upper Takutu-Upper Essequibo",
		key: "UT"
	}
];
var HN$2 = [
	{
		name: "Atlántida",
		key: "AT"
	},
	{
		name: "Choluteca",
		key: "CH"
	},
	{
		name: "Colón",
		key: "CL"
	},
	{
		name: "Comayagua",
		key: "CM"
	},
	{
		name: "Copán",
		key: "CP"
	},
	{
		name: "Cortés",
		key: "CR"
	},
	{
		name: "El Paraíso",
		key: "EP"
	},
	{
		name: "Francisco Morazán",
		key: "FM"
	},
	{
		name: "Gracias a Dios",
		key: "GD"
	},
	{
		name: "Islas de la Bahía",
		key: "IB"
	},
	{
		name: "Intibucá",
		key: "IN"
	},
	{
		name: "Lempira",
		key: "LE"
	},
	{
		name: "La Paz",
		key: "LP"
	},
	{
		name: "Ocotepeque",
		key: "OC"
	},
	{
		name: "Olancho",
		key: "OL"
	},
	{
		name: "Santa Bárbara",
		key: "SB"
	},
	{
		name: "Valle",
		key: "VA"
	},
	{
		name: "Yoro",
		key: "YO"
	}
];
var HT$2 = [
	{
		name: "Artibonite",
		key: "AR"
	},
	{
		name: "Centre",
		key: "CE"
	},
	{
		name: "Grande’Anse",
		key: "GA"
	},
	{
		name: "Nord",
		key: "ND"
	},
	{
		name: "Nord-Est",
		key: "NE"
	},
	{
		name: "Nippes",
		key: "NI"
	},
	{
		name: "Nord-Ouest",
		key: "NO"
	},
	{
		name: "Ouest",
		key: "OU"
	},
	{
		name: "Sud",
		key: "SD"
	},
	{
		name: "Sud-Est",
		key: "SE"
	}
];
var HU$3 = [
	{
		name: "Baranya",
		key: "BA"
	},
	{
		name: "Békéscsaba",
		key: "BC"
	},
	{
		name: "Békés",
		key: "BE"
	},
	{
		name: "Bács-Kiskun",
		key: "BK"
	},
	{
		name: "Budapest",
		key: "BU"
	},
	{
		name: "Borsod-Abaúj-Zemplén",
		key: "BZ"
	},
	{
		name: "Csongrád",
		key: "CS"
	},
	{
		name: "Debrecen",
		key: "DE"
	},
	{
		name: "Dunaújváros",
		key: "DU"
	},
	{
		name: "Eger",
		key: "EG"
	},
	{
		name: "Érd",
		key: "ER"
	},
	{
		name: "Fejér",
		key: "FE"
	},
	{
		name: "Győr‐Moson‐Sopron",
		key: "GS"
	},
	{
		name: "Győr",
		key: "GY"
	},
	{
		name: "Hajdú-Bihar",
		key: "HB"
	},
	{
		name: "Heves",
		key: "HE"
	},
	{
		name: "Hódmezővásárhely",
		key: "HV"
	},
	{
		name: "Jász-Nagykun-Szolnok",
		key: "JN"
	},
	{
		name: "Komárom-Esztergom",
		key: "KE"
	},
	{
		name: "Kecskemét",
		key: "KM"
	},
	{
		name: "Kaposvár",
		key: "KV"
	},
	{
		name: "Miskolc",
		key: "MI"
	},
	{
		name: "Nagykanizsa",
		key: "NK"
	},
	{
		name: "Nógrád",
		key: "NO"
	},
	{
		name: "Nyíregyháza",
		key: "NY"
	},
	{
		name: "Pest",
		key: "PE"
	},
	{
		name: "Pécs",
		key: "PS"
	},
	{
		name: "Szeged",
		key: "SD"
	},
	{
		name: "Székesfehérvár",
		key: "SF"
	},
	{
		name: "Szombathely",
		key: "SH"
	},
	{
		name: "Szolnok",
		key: "SK"
	},
	{
		name: "Sopron",
		key: "SN"
	},
	{
		name: "Somogy",
		key: "SO"
	},
	{
		name: "Szekszárd",
		key: "SS"
	},
	{
		name: "Salgótarján",
		key: "ST"
	},
	{
		name: "Szabolcs-Szatmár-Bereg",
		key: "SZ"
	},
	{
		name: "Tatabánya",
		key: "TB"
	},
	{
		name: "Tolna",
		key: "TO"
	},
	{
		name: "Vas",
		key: "VA"
	},
	{
		name: "Veszprém",
		key: "VE"
	},
	{
		name: "Veszprém",
		key: "VM"
	},
	{
		name: "Zala",
		key: "ZA"
	},
	{
		name: "Zalaegerszeg",
		key: "ZE"
	}
];
var ID$2 = [
	{
		name: "Aceh",
		key: "AC"
	},
	{
		name: "Bali",
		key: "BA"
	},
	{
		name: {
			"default": "Kepulauan Bangka Belitung",
			alt_en: "Bangka-Belitung Islands"
		},
		key: "BB"
	},
	{
		name: "Bengkulu",
		key: "BE"
	},
	{
		name: "Banten",
		key: "BT"
	},
	{
		name: "Gorontalo",
		key: "GO"
	},
	{
		name: "Jambi",
		key: "JA"
	},
	{
		name: {
			"default": "Jawa Barat",
			alt_en: "West Java"
		},
		key: "JB"
	},
	{
		name: {
			"default": "Jawa Timur",
			alt_en: "East Java"
		},
		key: "JI"
	},
	{
		name: {
			"default": "Daerah Khusus Ibukota Jakarta",
			alt_en: "Jakarta Special Capital Region"
		},
		key: "JK"
	},
	{
		name: {
			"default": "Jawa Tengah",
			alt_en: "Central Java"
		},
		key: "JT"
	},
	{
		name: {
			"default": "Kalimantan Barat",
			alt_en: "West Kalimantan"
		},
		key: "KB"
	},
	{
		name: {
			"default": "Kalimantan Timur",
			alt_en: "East Kalimantan"
		},
		key: "KI"
	},
	{
		name: {
			"default": "Kepulauan Riau",
			alt_en: "Riau Islands"
		},
		key: "KR"
	},
	{
		name: {
			"default": "Kalimantan Selatan",
			alt_en: "South Kalimantan"
		},
		key: "KS"
	},
	{
		name: {
			"default": "Kalimantan Tengah",
			alt_en: "Central Kalimantan"
		},
		key: "KT"
	},
	{
		name: {
			"default": "Kalimantan Utara",
			alt_en: "North Kalimantan"
		},
		key: "KU"
	},
	{
		name: "Lampung",
		key: "LA"
	},
	{
		name: "Maluku",
		key: "MA"
	},
	{
		name: {
			"default": "Maluku Utara",
			alt_en: "North Maluku"
		},
		key: "MU"
	},
	{
		name: "Nusa Tenggara Barat",
		key: "NB"
	},
	{
		name: "Nusa Tenggara Timur",
		key: "NT"
	},
	{
		name: "Papua",
		key: "PA"
	},
	{
		name: {
			"default": "Papua Barat",
			alt_en: "West Papua"
		},
		key: "PB"
	},
	{
		name: "Riau",
		key: "RI"
	},
	{
		name: {
			"default": "Sulawesi Utara",
			alt_en: "North Sulawesi"
		},
		key: "SA"
	},
	{
		name: {
			"default": "Sumatera Barat",
			alt_en: "West Sumatra"
		},
		key: "SB"
	},
	{
		name: {
			"default": "Sulawesi Tenggara",
			alt_en: "Southeast Sulawesi"
		},
		key: "SG"
	},
	{
		name: {
			"default": "Sulawesi Selatan",
			alt_en: "South Sulawesi"
		},
		key: "SN"
	},
	{
		name: {
			"default": "Sulawesi Barat",
			alt_en: "West Sulawesi"
		},
		key: "SR"
	},
	{
		name: {
			"default": "Sumatera Selatan",
			alt_en: "South Sumatra"
		},
		key: "SS"
	},
	{
		name: {
			"default": "Sulawesi Tengah",
			alt_en: "Central Sulawesi"
		},
		key: "ST"
	},
	{
		name: {
			"default": "Sumatera Utara",
			alt_en: "North Sumatra"
		},
		key: "SU"
	},
	{
		name: {
			"default": "Daerah Istimewa Yogyakarta",
			alt_en: "Special Region of Yogyakarta"
		},
		key: "YO"
	}
];
var IE$3 = [
	{
		name: "Connacht",
		key: "C"
	},
	{
		name: "Leinster",
		key: "L"
	},
	{
		name: "Munster",
		key: "M"
	},
	{
		name: "Ulster",
		key: "U"
	}
];
var IN$2 = [
	{
		name: "Andaman and Nicobar Islands",
		key: "AN"
	},
	{
		name: "Andhra Pradesh",
		key: "AP"
	},
	{
		name: "Arunachal Pradesh",
		key: "AR"
	},
	{
		name: "Assam",
		key: "AS"
	},
	{
		name: "Bihar",
		key: "BR"
	},
	{
		name: "Chandigarh",
		key: "CH"
	},
	{
		name: "Chhattisgarh",
		key: "CT"
	},
	{
		name: "Daman and Diu",
		key: "DD"
	},
	{
		name: "Delhi",
		key: "DL"
	},
	{
		name: "Dadra and Nagar Haveli",
		key: "DN"
	},
	{
		name: "Goa",
		key: "GA"
	},
	{
		name: "Gujarat",
		key: "GJ"
	},
	{
		name: "Himachal Pradesh",
		key: "HP"
	},
	{
		name: "Haryana",
		key: "HR"
	},
	{
		name: "Jharkhand",
		key: "JH"
	},
	{
		name: "Jammu and Kashmir",
		key: "JK"
	},
	{
		name: "Karnataka",
		key: "KA"
	},
	{
		name: "Kerala",
		key: "KL"
	},
	{
		name: "Lakshadweep",
		key: "LD"
	},
	{
		name: "Maharashtra",
		key: "MH"
	},
	{
		name: "Meghalaya",
		key: "ML"
	},
	{
		name: "Manipur",
		key: "MN"
	},
	{
		name: "Madhya Pradesh",
		key: "MP"
	},
	{
		name: "Mizoram",
		key: "MZ"
	},
	{
		name: "Nagaland",
		key: "NL"
	},
	{
		name: "Odisha",
		key: "OR"
	},
	{
		name: "Punjab",
		key: "PB"
	},
	{
		name: "Puducherry",
		key: "PY"
	},
	{
		name: "Rajasthan",
		key: "RJ"
	},
	{
		name: "Sikkim",
		key: "SK"
	},
	{
		name: "Telangana",
		key: "TG"
	},
	{
		name: "Tamil Nadu",
		key: "TN"
	},
	{
		name: "Tripura",
		key: "TR"
	},
	{
		name: "Uttar Pradesh",
		key: "UP"
	},
	{
		name: "Uttarakhand",
		key: "UT"
	},
	{
		name: "West Bengal",
		key: "WB"
	}
];
var IT$4 = [
	{
		name: "Abruzzo",
		key: "ABR"
	},
	{
		name: "Basilicata",
		key: "BAS"
	},
	{
		name: "Calabria",
		key: "CAL"
	},
	{
		name: "Campania",
		key: "CAM"
	},
	{
		name: "Emilia-Romagna",
		key: "EMI"
	},
	{
		name: "Friuli Venezia Giulia",
		key: "FRI"
	},
	{
		name: "Lazio",
		key: "LAZ"
	},
	{
		name: "Liguria",
		key: "LIG"
	},
	{
		name: "Lombardia",
		key: "LOM"
	},
	{
		name: "Marche",
		key: "MAR"
	},
	{
		name: "Molise",
		key: "MOL"
	},
	{
		name: "Piemonte",
		key: "PIE"
	},
	{
		name: "Puglia",
		key: "PUG"
	},
	{
		name: "Sardegna",
		key: "SAR"
	},
	{
		name: "Sicilia",
		key: "SIC"
	},
	{
		name: "Toscana",
		key: "TOS"
	},
	{
		name: {
			"default": "Trentino-Alto Adige/Südtirol",
			alt_de: "Trentino-Südtirol",
			alt_it: "Trentino-Alto Adige"
		},
		key: "TRE"
	},
	{
		name: "Umbria",
		key: "UMB"
	},
	{
		name: "Valle d'Aosta",
		key: "VAL"
	},
	{
		name: "Veneto",
		key: "VEN"
	}
];
var JO$2 = [
	{
		name: {
			"default": "عجلون",
			alt_en: "Ajlun"
		},
		key: "AJ"
	},
	{
		name: {
			"default": "عمان",
			alt_en: "Amman"
		},
		key: "AM"
	},
	{
		name: {
			"default": "العقبة",
			alt_en: "Aqaba"
		},
		key: "AQ"
	},
	{
		name: {
			"default": "الطفيلة",
			alt_en: "Tafilah"
		},
		key: "AT"
	},
	{
		name: {
			"default": "الزرقاء",
			alt_en: "Zarqa"
		},
		key: "AZ"
	},
	{
		name: {
			"default": "البلقاء",
			alt_en: "Balqa"
		},
		key: "BA"
	},
	{
		name: {
			"default": "إربد",
			alt_en: "Irbid"
		},
		key: "IR"
	},
	{
		name: {
			"default": "جرش",
			alt_en: "Jarash"
		},
		key: "JA"
	},
	{
		name: {
			"default": "الكرك",
			alt_en: "Karak"
		},
		key: "KA"
	},
	{
		name: {
			"default": "المفرق",
			alt_en: "Mafraq"
		},
		key: "MA"
	},
	{
		name: {
			"default": "مادبا",
			alt_en: "Madaba"
		},
		key: "MD"
	},
	{
		name: {
			"default": "معان",
			alt_en: "Maan"
		},
		key: "MN"
	}
];
var KG$2 = [
	{
		name: {
			"default": "Баткенская область",
			alt_en: "Batken Region"
		},
		key: "B"
	},
	{
		name: {
			"default": "Чуйская область",
			alt_en: "Chuy Region"
		},
		key: "C"
	},
	{
		name: {
			"default": "Бишкек",
			alt_en: "Bishkek"
		},
		key: "GB"
	},
	{
		name: {
			"default": "Ош",
			alt_en: "City of Osh"
		},
		key: "GO"
	},
	{
		name: {
			"default": "Джалал-Абадская область",
			alt_en: "Jalal-Abad Region"
		},
		key: "J"
	},
	{
		name: {
			"default": "Нарынская область",
			alt_en: "Naryn Region"
		},
		key: "N"
	},
	{
		name: {
			"default": "Ошская область",
			alt_en: "Osh Region"
		},
		key: "O"
	},
	{
		name: {
			"default": "Таласская область",
			alt_en: "Talas Region"
		},
		key: "T"
	},
	{
		name: {
			"default": "Иссык-Кульская область",
			alt_en: "Issyk-Kul Region"
		},
		key: "Y"
	}
];
var KI$2 = [
	{
		name: "Gilbert Islands",
		key: "G"
	},
	{
		name: "Line Islands",
		key: "L"
	},
	{
		name: "Phoenix Islands",
		key: "P"
	}
];
var KM$2 = [
	{
		name: "Anjouan",
		key: "A"
	},
	{
		name: "Grande Comore",
		key: "G"
	},
	{
		name: "Mohéli",
		key: "M"
	}
];
var KN$2 = [
	{
		name: "Saint Kitts",
		key: "K"
	},
	{
		name: "Nevis",
		key: "N"
	}
];
var KW$2 = [
	{
		name: {
			"default": "الاحمدي",
			alt_en: "Ahmadi"
		},
		key: "AH"
	},
	{
		name: {
			"default": "الفروانية",
			alt_en: "Farwaniya"
		},
		key: "FA"
	},
	{
		name: {
			"default": "حولي",
			alt_en: "Hawalli"
		},
		key: "HA"
	},
	{
		name: {
			"default": "الجهراء",
			alt_en: "Jahra"
		},
		key: "JA"
	},
	{
		name: {
			"default": "العاصمة",
			alt_en: "Al Asimah"
		},
		key: "KU"
	},
	{
		name: {
			"default": "مبارك الكبير",
			alt_en: "Mubarak Al-Kabeer"
		},
		key: "MU"
	}
];
var LA$2 = [
	{
		name: {
			"default": "ອັດຕະປື",
			alt_en: "Attapeu"
		},
		key: "AT"
	},
	{
		name: {
			"default": "ບໍ່ແກ້ວ",
			alt_en: "Bokeo Province"
		},
		key: "BK"
	},
	{
		name: {
			"default": "ບໍລິຄຳໄຊ",
			alt_en: "Bolikhamsai"
		},
		key: "BL"
	},
	{
		name: {
			"default": "ຈຳປາສັກ",
			alt_en: "Champasak Province"
		},
		key: "CH"
	},
	{
		name: {
			"default": "ຫົວພັນ",
			alt_en: "Houaphanh"
		},
		key: "HO"
	},
	{
		name: {
			"default": "ຄໍາມ່ວນ",
			alt_en: "Khammouane"
		},
		key: "KH"
	},
	{
		name: {
			"default": "ຫລວງນໍ້າທາ",
			alt_en: "Luang Namtha"
		},
		key: "LM"
	},
	{
		name: {
			"default": "ຫລວງພະບາງ",
			alt_en: "Luang Prabang"
		},
		key: "LP"
	},
	{
		name: {
			"default": "ອຸດົມໄຊ",
			alt_en: "Oudomxay"
		},
		key: "OU"
	},
	{
		name: {
			"default": "ຜົ້ງສາລີ",
			alt_en: "Phongsaly"
		},
		key: "PH"
	},
	{
		name: {
			"default": "ສາລະວັນ",
			alt_en: "Salavan Province"
		},
		key: "SL"
	},
	{
		name: {
			"default": "ສະຫວັນນະເຂດ",
			alt_en: "Savannakhet Province"
		},
		key: "SV"
	},
	{
		name: {
			"default": "ວຽງຈັນ",
			alt_en: "Vientiane Province"
		},
		key: "VI"
	},
	{
		name: {
			"default": "ນະຄອນຫຼວງວຽງຈັນ",
			alt_en: "Vientiane Prefecture"
		},
		key: "VT"
	},
	{
		name: {
			"default": "ໄຊຍະບູລີ",
			alt_en: "Sainyabuli Province"
		},
		key: "XA"
	},
	{
		name: {
			"default": "ເຊກອງ",
			alt_en: "Sekong Province"
		},
		key: "XE"
	},
	{
		name: {
			"default": "ຊຽງຂວາງ",
			alt_en: "Xiangkhouang Province"
		},
		key: "XI"
	},
	{
		name: {
			"default": "ໄຊສົມບູນ",
			alt_en: "Xaisomboun Province"
		},
		key: "XS"
	}
];
var KZ$2 = [
	{
		name: {
			"default": "Акмолинская область",
			alt_en: "Akmola Region"
		},
		key: "AKM"
	},
	{
		name: {
			"default": "Актюбинская область",
			alt_en: "Aktobe Region"
		},
		key: "AKT"
	},
	{
		name: {
			"default": "Алматы",
			alt_en: "Almaty"
		},
		key: "ALA"
	},
	{
		name: {
			"default": "Алматинская область",
			alt_en: "Almaty Region"
		},
		key: "ALM"
	},
	{
		name: {
			"default": "Нур-Султан",
			alt_en: "Nur-Sultan"
		},
		key: "AST"
	},
	{
		name: {
			"default": "Атырауская область",
			alt_en: "Atyrau Region"
		},
		key: "ATY"
	},
	{
		name: {
			"default": "Карагандинская область",
			alt_en: "Karaganda Region"
		},
		key: "KAR"
	},
	{
		name: {
			"default": "Костанайская область",
			alt_en: "Kostanay Region"
		},
		key: "KUS"
	},
	{
		name: {
			"default": "Кызылординская область",
			alt_en: "Kyzylorda Region"
		},
		key: "KZY"
	},
	{
		name: {
			"default": "Мангистауская область",
			alt_en: "Mangystau Region"
		},
		key: "MAN"
	},
	{
		name: {
			"default": "Павлодарская область",
			alt_en: "Pavlodar Region"
		},
		key: "PAV"
	},
	{
		name: {
			"default": "Северо-Казахстанская область",
			alt_en: "North Kazakhstan Region"
		},
		key: "SEV"
	},
	{
		name: {
			"default": "Шымкент",
			alt_en: "Shymkent Region"
		},
		key: "SHY"
	},
	{
		name: {
			"default": "Восточно-Казахстанская область",
			alt_en: "East Kazakhstan Region"
		},
		key: "VOS"
	},
	{
		name: {
			"default": "Туркестанская область",
			alt_en: "Turkistan Region"
		},
		key: "YUZ"
	},
	{
		name: {
			"default": "Западно-Казахстанская область",
			alt_en: "West Kazakhstan Region"
		},
		key: "ZAP"
	},
	{
		name: {
			"default": "Жамбылская область",
			alt_en: "Jambyl Region"
		},
		key: "ZHA"
	}
];
var LB$2 = [
	{
		name: {
			"default": "محافظة عكار",
			alt_en: "Akkar Governorate",
			alt_fr: "Gouvernorat de l'Akkar"
		},
		key: "AK"
	},
	{
		name: {
			"default": "محافظة الشمال",
			alt_en: "North Governorate",
			alt_fr: "Gouvernorat du Liban Nord"
		},
		key: "AS"
	},
	{
		name: {
			"default": "محافظة بيروت",
			alt_en: "Beirut Governorate",
			alt_fr: "Gouvernorat de Beyrouth"
		},
		key: "BA"
	},
	{
		name: {
			"default": "محافظة بعلبك الهرمل",
			alt_en: "Baalbek-Hermel Governorate",
			alt_fr: "Gouvernorat de Baalbek-Hermel"
		},
		key: "BH"
	},
	{
		name: {
			"default": "محافظة البقاع",
			alt_en: "Beqaa Governorate",
			alt_fr: "Gouvernorat de Beqaa"
		},
		key: "BI"
	},
	{
		name: {
			"default": "محافظة الجنوب",
			alt_en: "South Governorate",
			alt_fr: "Gouvernorat du Liban Sud"
		},
		key: "JA"
	},
	{
		name: {
			"default": "محافظة جبل لبنان",
			alt_en: "Mount Lebanon Governorate",
			alt_fr: "Gouvernorat du Mont Liban"
		},
		key: "JL"
	},
	{
		name: {
			"default": "محافظة النبطية",
			alt_en: "Nabatiya Governorate",
			alt_fr: "Gouvernorat de Nabatiyeh"
		},
		key: "NA"
	}
];
var LR$2 = [
	{
		name: "Bong",
		key: "BG"
	},
	{
		name: "Bomi",
		key: "BM"
	},
	{
		name: "Grand Cape Mount",
		key: "CM"
	},
	{
		name: "Grand Bassa",
		key: "GB"
	},
	{
		name: "Grand Gedeh",
		key: "GG"
	},
	{
		name: "Grand Kru",
		key: "GK"
	},
	{
		name: "Gbarpolu",
		key: "GP"
	},
	{
		name: "Lofa",
		key: "LO"
	},
	{
		name: "Margibi",
		key: "MG"
	},
	{
		name: "Montserrado",
		key: "MO"
	},
	{
		name: "Maryland",
		key: "MY"
	},
	{
		name: "Nimba",
		key: "NI"
	},
	{
		name: "River Gee",
		key: "RG"
	},
	{
		name: "River Cess",
		key: "RI"
	},
	{
		name: "Sinoe",
		key: "SI"
	}
];
var LS$2 = [
	{
		name: "Maseru",
		key: "A"
	},
	{
		name: "Butha-Buthe",
		key: "B"
	},
	{
		name: "Leribe",
		key: "C"
	},
	{
		name: "Berea",
		key: "D"
	},
	{
		name: "Mafeteng",
		key: "E"
	},
	{
		name: "Mohale's Hoek",
		key: "F"
	},
	{
		name: "Quthing",
		key: "G"
	},
	{
		name: "Qacha's Nek",
		key: "H"
	},
	{
		name: "Mokhotlong",
		key: "J"
	},
	{
		name: "Thaba-Tseka",
		key: "K"
	}
];
var LT$2 = [
	{
		name: {
			"default": "Alytaus apskritis",
			alt_en: "Alytus County"
		},
		key: "AL"
	},
	{
		name: {
			"default": "Klaipėdos apskritis",
			alt_en: "Klaipeda County"
		},
		key: "KL"
	},
	{
		name: {
			"default": "Kauno apskritis",
			alt_en: "Kaunas County"
		},
		key: "KU"
	},
	{
		name: {
			"default": "Marijampolės apskritis",
			alt_en: "Marijampole County"
		},
		key: "MR"
	},
	{
		name: {
			"default": "Panevėžio apskritis",
			alt_en: "Panevezys County"
		},
		key: "PN"
	},
	{
		name: {
			"default": "Šiaulių apskritis",
			alt_en: "Siauliai County"
		},
		key: "SA"
	},
	{
		name: {
			"default": "Tauragės apskritis",
			alt_en: "Taurage County"
		},
		key: "TA"
	},
	{
		name: {
			"default": "Telšių apskritis",
			alt_en: "Telsiai County"
		},
		key: "TE"
	},
	{
		name: {
			"default": "Utenos apskritis",
			alt_en: "Utena County"
		},
		key: "UT"
	},
	{
		name: {
			"default": "Vilniaus apskritis",
			alt_en: "Vilnius County"
		},
		key: "VL"
	}
];
var LY$2 = [
	{
		name: {
			"default": "بنغازي",
			alt_en: "Benghazi"
		},
		key: "BA"
	},
	{
		name: {
			"default": "البطنان",
			alt_en: "Butnan"
		},
		key: "BU"
	},
	{
		name: {
			"default": "درنة",
			alt_en: "Derna"
		},
		key: "DR"
	},
	{
		name: {
			"default": "غات",
			alt_en: "Ghat"
		},
		key: "GT"
	},
	{
		name: {
			"default": "الجبل الأخضر",
			alt_en: "Jabal al Akhdar"
		},
		key: "JA"
	},
	{
		name: {
			"default": "الجبل الغربي",
			alt_en: "Jabal al Gharbi"
		},
		key: "JG"
	},
	{
		name: {
			"default": "الجفارة",
			alt_en: "Jafara"
		},
		key: "JI"
	},
	{
		name: {
			"default": "الجفرة",
			alt_en: "Jufra"
		},
		key: "JU"
	},
	{
		name: {
			"default": "الكفرة",
			alt_en: "Kufra"
		},
		key: "KF"
	},
	{
		name: {
			"default": "المرقب",
			alt_en: "Murqub"
		},
		key: "MB"
	},
	{
		name: {
			"default": "بني وليد",
			alt_en: "Bani Walid"
		},
		key: "MI"
	},
	{
		name: {
			"default": "المرج",
			alt_en: "Marj"
		},
		key: "MJ"
	},
	{
		name: {
			"default": "مرزق",
			alt_en: "Murzuq"
		},
		key: "MQ"
	},
	{
		name: {
			"default": "نالوت",
			alt_en: "Nalut"
		},
		key: "NL"
	},
	{
		name: {
			"default": "النقاط الخمس",
			alt_en: "Nuqat al Khams"
		},
		key: "NQ"
	},
	{
		name: {
			"default": "سبها",
			alt_en: "Sabha"
		},
		key: "SB"
	},
	{
		name: {
			"default": "سرت",
			alt_en: "Sirte"
		},
		key: "SR"
	},
	{
		name: {
			"default": "طرابلس",
			alt_en: "Tripoli"
		},
		key: "TB"
	},
	{
		name: {
			"default": "الواحات",
			alt_en: "Al Wahat"
		},
		key: "WA"
	},
	{
		name: {
			"default": "وادي الحياة",
			alt_en: "Wadi al Hayaa"
		},
		key: "WD"
	},
	{
		name: {
			"default": "وادي الشاطئ",
			alt_en: "Wadi al Shatii"
		},
		key: "WS"
	},
	{
		name: {
			"default": "الزاوية",
			alt_en: "Zawiya"
		},
		key: "ZA"
	}
];
var MD$2 = [
	{
		name: "Anenii Noi",
		key: "AN"
	},
	{
		name: "Bălţi",
		key: "BA"
	},
	{
		name: "Bender [Tighina]",
		key: "BD"
	},
	{
		name: "Briceni",
		key: "BR"
	},
	{
		name: "Basarabeasca",
		key: "BS"
	},
	{
		name: "Cahul",
		key: "CA"
	},
	{
		name: "Călăraşi",
		key: "CL"
	},
	{
		name: "Cimişlia",
		key: "CM"
	},
	{
		name: "Criuleni",
		key: "CR"
	},
	{
		name: "Căuşeni",
		key: "CS"
	},
	{
		name: "Cantemir",
		key: "CT"
	},
	{
		name: "Chişinău",
		key: "CU"
	},
	{
		name: "Donduşeni",
		key: "DO"
	},
	{
		name: "Drochia",
		key: "DR"
	},
	{
		name: "Dubăsari",
		key: "DU"
	},
	{
		name: "Edineţ",
		key: "ED"
	},
	{
		name: "Făleşti",
		key: "FA"
	},
	{
		name: "Floreşti",
		key: "FL"
	},
	{
		name: "Găgăuzia",
		key: "GA"
	},
	{
		name: "Glodeni",
		key: "GL"
	},
	{
		name: "Hînceşti",
		key: "HI"
	},
	{
		name: "Ialoveni",
		key: "IA"
	},
	{
		name: "Leova",
		key: "LE"
	},
	{
		name: "Nisporeni",
		key: "NI"
	},
	{
		name: "Ocniþa",
		key: "OC"
	},
	{
		name: "Orhei",
		key: "OR"
	},
	{
		name: "Rezina",
		key: "RE"
	},
	{
		name: "Rîşcani",
		key: "RI"
	},
	{
		name: "Şoldăneşti",
		key: "SD"
	},
	{
		name: "Sîngerei",
		key: "SI"
	},
	{
		name: "Stînga Nistrului",
		key: "SN"
	},
	{
		name: "Soroca",
		key: "SO"
	},
	{
		name: "Străşeni",
		key: "ST"
	},
	{
		name: "Ştefan Vodă",
		key: "SV"
	},
	{
		name: "Taraclia",
		key: "TA"
	},
	{
		name: "Teleneşti",
		key: "TE"
	},
	{
		name: "Ungheni",
		key: "UN"
	}
];
var MG$2 = [
	{
		name: "Toamasina",
		key: "A"
	},
	{
		name: "Antsiranana",
		key: "D"
	},
	{
		name: "Fianarantsoa",
		key: "F"
	},
	{
		name: "Mahajanga",
		key: "M"
	},
	{
		name: "Antananarivo",
		key: "T"
	},
	{
		name: "Toliara",
		key: "U"
	}
];
var MU$2 = [
	{
		name: "Black River",
		key: "BL"
	},
	{
		name: "Flacq",
		key: "FL"
	},
	{
		name: "Grand Port",
		key: "GP"
	},
	{
		name: "Moka",
		key: "MO"
	},
	{
		name: "Pamplemousses",
		key: "PA"
	},
	{
		name: "Port Louis",
		key: "PL"
	},
	{
		name: "Plaines Wilhems",
		key: "PW"
	},
	{
		name: "Rivière du Rempart",
		key: "RR"
	},
	{
		name: "Savanne",
		key: "SA"
	}
];
var MW$2 = [
	{
		name: "Balaka",
		key: "BA"
	},
	{
		name: "Blantyre",
		key: "BL"
	},
	{
		name: "Central",
		key: "C"
	},
	{
		name: "Chikwawa",
		key: "CK"
	},
	{
		name: "Chiradzulu",
		key: "CR"
	},
	{
		name: "Chitipa",
		key: "CT"
	},
	{
		name: "Dedza",
		key: "DE"
	},
	{
		name: "Dowa",
		key: "DO"
	},
	{
		name: "Karonga",
		key: "KR"
	},
	{
		name: "Kasungu",
		key: "KS"
	},
	{
		name: "Lilongwe",
		key: "LI"
	},
	{
		name: "Likoma",
		key: "LK"
	},
	{
		name: "Mchinji",
		key: "MC"
	},
	{
		name: "Mangochi",
		key: "MG"
	},
	{
		name: "Machinga",
		key: "MH"
	},
	{
		name: "Mulanje",
		key: "MU"
	},
	{
		name: "Mwanza",
		key: "MW"
	},
	{
		name: "Mzimba",
		key: "MZ"
	},
	{
		name: "Northern",
		key: "N"
	},
	{
		name: "Nkhata Bay",
		key: "NB"
	},
	{
		name: "Neno",
		key: "NE"
	},
	{
		name: "Ntchisi",
		key: "NI"
	},
	{
		name: "Nkhotakota",
		key: "NK"
	},
	{
		name: "Nsanje",
		key: "NS"
	},
	{
		name: "Ntcheu",
		key: "NU"
	},
	{
		name: "Phalombe",
		key: "PH"
	},
	{
		name: "Rumphi",
		key: "RU"
	},
	{
		name: "Southern",
		key: "S"
	},
	{
		name: "Salima",
		key: "SA"
	},
	{
		name: "Thyolo",
		key: "TH"
	},
	{
		name: "Zomba",
		key: "ZO"
	}
];
var MX$2 = [
	{
		name: "Aguascalientes",
		key: "AGU"
	},
	{
		name: "Baja California",
		key: "BCN"
	},
	{
		name: {
			"default": "Baja California Sur",
			alt_en: "Lower California South"
		},
		key: "BCS"
	},
	{
		name: "Campeche",
		key: "CAM"
	},
	{
		name: "Chihuahua",
		key: "CHH"
	},
	{
		name: "Chiapas",
		key: "CHP"
	},
	{
		name: {
			"default": "Ciudad de México",
			alt_en: "Mexico City"
		},
		key: "CMX"
	},
	{
		name: "Coahuila de Zaragoza",
		key: "COA"
	},
	{
		name: "Colima",
		key: "COL"
	},
	{
		name: "Durango",
		key: "DUR"
	},
	{
		name: "Guerrero",
		key: "GRO"
	},
	{
		name: "Guanajuato",
		key: "GUA"
	},
	{
		name: "Hidalgo",
		key: "HID"
	},
	{
		name: "Jalisco",
		key: "JAL"
	},
	{
		name: {
			"default": "Estado de México",
			alt_en: "State of Mexico"
		},
		key: "MEX"
	},
	{
		name: {
			"default": "Michoacán de Ocampo",
			alt_en: "Michoacán"
		},
		key: "MIC"
	},
	{
		name: "Morelos",
		key: "MOR"
	},
	{
		name: "Nayarit",
		key: "NAY"
	},
	{
		name: "Nuevo León",
		key: "NLE"
	},
	{
		name: "Oaxaca",
		key: "OAX"
	},
	{
		name: "Puebla",
		key: "PUE"
	},
	{
		name: "Querétaro",
		key: "QUE"
	},
	{
		name: "Quintana Roo",
		key: "ROO"
	},
	{
		name: "Sinaloa",
		key: "SIN"
	},
	{
		name: "San Luis Potosí",
		key: "SLP"
	},
	{
		name: "Sonora",
		key: "SON"
	},
	{
		name: "Tabasco",
		key: "TAB"
	},
	{
		name: "Tamaulipas",
		key: "TAM"
	},
	{
		name: "Tlaxcala",
		key: "TLA"
	},
	{
		name: {
			"default": "Veracruz de Ignacio de la Llave",
			alt_en: "Veracruz"
		},
		key: "VER"
	},
	{
		name: "Yucatán",
		key: "YUC"
	},
	{
		name: "Zacatecas",
		key: "ZAC"
	}
];
var MY$2 = [
	{
		name: "Johor",
		key: "JHR"
	},
	{
		name: "Kedah",
		key: "KDH"
	},
	{
		name: "Kelantan",
		key: "KTN"
	},
	{
		name: "Kuala Lumpur",
		key: "KUL"
	},
	{
		name: "Lauban",
		key: "LBN"
	},
	{
		name: "Malacca",
		key: "MLK"
	},
	{
		name: "Negeri Sembilan",
		key: "NSN"
	},
	{
		name: "Pahang",
		key: "PHG"
	},
	{
		name: "Putrajaya",
		key: "PJY"
	},
	{
		name: "Perlis",
		key: "PLS"
	},
	{
		name: "Penang",
		key: "PNG"
	},
	{
		name: "Perak",
		key: "PRK"
	},
	{
		name: "Sabah",
		key: "SBH"
	},
	{
		name: "Selangor",
		key: "SGR"
	},
	{
		name: "Sarawak",
		key: "SWK"
	},
	{
		name: "Terengganu",
		key: "TRG"
	}
];
var MZ$2 = [
	{
		name: "Niaosa",
		key: "A"
	},
	{
		name: "Manica",
		key: "B"
	},
	{
		name: "Gaza",
		key: "G"
	},
	{
		name: "Inhambane",
		key: "I"
	},
	{
		name: "Maputo",
		key: "L"
	},
	{
		name: "Maputo",
		key: "MPM"
	},
	{
		name: "Nampula",
		key: "N"
	},
	{
		name: "Cabo Delgado",
		key: "P"
	},
	{
		name: "Zambézia",
		key: "Q"
	},
	{
		name: "Sofala",
		key: "S"
	},
	{
		name: "Tete",
		key: "T"
	}
];
var NA$2 = [
	{
		name: "Zambezi",
		key: "CA"
	},
	{
		name: "Erongo",
		key: "ER"
	},
	{
		name: "Hardap",
		key: "HA"
	},
	{
		name: "Karas",
		key: "KA"
	},
	{
		name: "Kavango East",
		key: "KE"
	},
	{
		name: "Khomas",
		key: "KH"
	},
	{
		name: "Kunene",
		key: "KU"
	},
	{
		name: "Kavango West",
		key: "KW"
	},
	{
		name: "Otjozondjupa",
		key: "OD"
	},
	{
		name: "Omaheke",
		key: "OH"
	},
	{
		name: "Oshana",
		key: "ON"
	},
	{
		name: "Omusati",
		key: "OS"
	},
	{
		name: "Oshikoto",
		key: "OT"
	},
	{
		name: "Ohangwena",
		key: "OW"
	}
];
var NG$2 = [
	{
		name: "Abia",
		key: "AB"
	},
	{
		name: "Adamawa",
		key: "AD"
	},
	{
		name: "Akwa Ibom",
		key: "AK"
	},
	{
		name: "Anambra",
		key: "AN"
	},
	{
		name: "Bauchi",
		key: "BA"
	},
	{
		name: "Benue",
		key: "BE"
	},
	{
		name: "Borno",
		key: "BO"
	},
	{
		name: "Bayelsa",
		key: "BY"
	},
	{
		name: "Cross River",
		key: "CR"
	},
	{
		name: "Delta",
		key: "DE"
	},
	{
		name: "Ebonyi",
		key: "EB"
	},
	{
		name: "Edo",
		key: "ED"
	},
	{
		name: "Ekiti",
		key: "EK"
	},
	{
		name: "Enugu",
		key: "EN"
	},
	{
		name: "Abuja Capital Territory",
		key: "FC"
	},
	{
		name: "Gombe",
		key: "GO"
	},
	{
		name: "Imo",
		key: "IM"
	},
	{
		name: "Jigawa",
		key: "JI"
	},
	{
		name: "Kaduna",
		key: "KD"
	},
	{
		name: "Kebbi",
		key: "KE"
	},
	{
		name: "Kano",
		key: "KN"
	},
	{
		name: "Kogi",
		key: "KO"
	},
	{
		name: "Katsina",
		key: "KT"
	},
	{
		name: "Kwara",
		key: "KW"
	},
	{
		name: "Lagos",
		key: "LA"
	},
	{
		name: "Nasarawa",
		key: "NA"
	},
	{
		name: "Niger",
		key: "NI"
	},
	{
		name: "Ogun",
		key: "OG"
	},
	{
		name: "Ondo",
		key: "ON"
	},
	{
		name: "Osun",
		key: "OS"
	},
	{
		name: "Oyo",
		key: "OY"
	},
	{
		name: "Plateau",
		key: "PL"
	},
	{
		name: "Rivers",
		key: "RI"
	},
	{
		name: "Sokoto",
		key: "SO"
	},
	{
		name: "Taraba",
		key: "TA"
	},
	{
		name: "Yobe",
		key: "YO"
	},
	{
		name: "Zamfara",
		key: "ZA"
	}
];
var NI$2 = [
	{
		name: "Atlántico Norte",
		key: "AN"
	},
	{
		name: "Atlántico Sur",
		key: "AS"
	},
	{
		name: "Boaco",
		key: "BO"
	},
	{
		name: "Carazo",
		key: "CA"
	},
	{
		name: "Chinandega",
		key: "CI"
	},
	{
		name: "Chontales",
		key: "CO"
	},
	{
		name: "Estelí",
		key: "ES"
	},
	{
		name: "Granada",
		key: "GR"
	},
	{
		name: "Jinotega",
		key: "JI"
	},
	{
		name: "León",
		key: "LE"
	},
	{
		name: "Madriz",
		key: "MD"
	},
	{
		name: "Managua",
		key: "MN"
	},
	{
		name: "Masaya",
		key: "MS"
	},
	{
		name: "Matagalpa",
		key: "MT"
	},
	{
		name: "Nueva Segovia",
		key: "NS"
	},
	{
		name: "Rivas",
		key: "RI"
	},
	{
		name: "Río San Juan",
		key: "SJ"
	}
];
var NL$3 = [
	{
		name: "Drenthe",
		key: "DR"
	},
	{
		name: "Flevoland",
		key: "FL"
	},
	{
		name: "Friesland",
		key: "FR"
	},
	{
		name: "Gelderland",
		key: "GE"
	},
	{
		name: "Groningen",
		key: "GR"
	},
	{
		name: "Limburg",
		key: "LI"
	},
	{
		name: {
			"default": "Noord-Brabant",
			alt_en: "North Brabant"
		},
		key: "NB"
	},
	{
		name: {
			"default": "Noord-Holland",
			alt_en: "North Holland"
		},
		key: "NH"
	},
	{
		name: "Overijssel",
		key: "OV"
	},
	{
		name: "Utrecht",
		key: "UT"
	},
	{
		name: "Zeeland",
		key: "ZE"
	},
	{
		name: {
			"default": "Zuid-Holland",
			alt_en: "South Holland"
		},
		key: "ZH"
	}
];
var NZ$2 = [
	{
		name: "Auckland",
		key: "AUK"
	},
	{
		name: "Bay of Plenty",
		key: "BOP"
	},
	{
		name: "Canterbury",
		key: "CAN"
	},
	{
		name: "Chatham Islands Territory",
		key: "CIT"
	},
	{
		name: "Gisborne",
		key: "GIS"
	},
	{
		name: "Hawkes's Bay",
		key: "HKB"
	},
	{
		name: "Marlborough",
		key: "MBH"
	},
	{
		name: "Manawatu-Wanganui",
		key: "MWT"
	},
	{
		name: "Nelson",
		key: "NSN"
	},
	{
		name: "Northland",
		key: "NTL"
	},
	{
		name: "Otago",
		key: "OTA"
	},
	{
		name: "Southland",
		key: "STL"
	},
	{
		name: "Tasman",
		key: "TAS"
	},
	{
		name: "Taranaki",
		key: "TKI"
	},
	{
		name: "Wellington",
		key: "WGN"
	},
	{
		name: "Waikato",
		key: "WKO"
	},
	{
		name: "West Coast",
		key: "WTC"
	}
];
var OM$2 = [
	{
		name: {
			"default": "محافظة جنوب الباطنة",
			alt_en: "Al Batinah South Governorate"
		},
		key: "BJ"
	},
	{
		name: {
			"default": "محافظة شمال الباطنة",
			alt_en: "Al Batinah North Governorate"
		},
		key: "BS"
	},
	{
		name: {
			"default": "محافظة البريمي",
			alt_en: "Al Buraymi Governorate"
		},
		key: "BU"
	},
	{
		name: {
			"default": "محافظة الداخلية",
			alt_en: "Ad Dakhiliyah Governorate"
		},
		key: "DA"
	},
	{
		name: {
			"default": "مسقط",
			alt_en: "Muscat"
		},
		key: "MA"
	},
	{
		name: {
			"default": "محافظة مسندم",
			alt_en: "Musandam Governorate"
		},
		key: "MU"
	},
	{
		name: {
			"default": "جنوب الشرقية",
			alt_en: "Ash Sharqiyah South"
		},
		key: "SJ"
	},
	{
		name: {
			"default": "شمال الشرقية",
			alt_en: "Ash Sharqiyah North"
		},
		key: "SS"
	},
	{
		name: {
			"default": "محافظة الوسطى",
			alt_en: "Al Wusta Governorate"
		},
		key: "WU"
	},
	{
		name: {
			"default": "محافظة الظاهرة",
			alt_en: "Ad Dhahirah Governorate"
		},
		key: "ZA"
	},
	{
		name: {
			"default": "محافظة ظفار",
			alt_en: "Dhofar"
		},
		key: "ZU"
	}
];
var PE$2 = [
	{
		name: "Amazonas",
		key: "AMA"
	},
	{
		name: "Ancash",
		key: "ANC"
	},
	{
		name: "Apurímac",
		key: "APU"
	},
	{
		name: "Arequipa",
		key: "ARE"
	},
	{
		name: "Ayacucho",
		key: "AYA"
	},
	{
		name: "Cajamarca",
		key: "CAJ"
	},
	{
		name: "El Callao",
		key: "CAL"
	},
	{
		name: "Cuzco",
		key: "CUS"
	},
	{
		name: "Huánuco",
		key: "HUC"
	},
	{
		name: "Huancavelica",
		key: "HUV"
	},
	{
		name: "Ica",
		key: "ICA"
	},
	{
		name: "Junín",
		key: "JUN"
	},
	{
		name: "La Libertad",
		key: "LAL"
	},
	{
		name: "Lambayeque",
		key: "LAM"
	},
	{
		name: "Lima",
		key: "LIM"
	},
	{
		name: "Lima hatun llaqta",
		key: "LMA"
	},
	{
		name: "Loreto",
		key: "LOR"
	},
	{
		name: "Madre de Dios",
		key: "MDD"
	},
	{
		name: "Moquegua",
		key: "MOQ"
	},
	{
		name: "Pasco",
		key: "PAS"
	},
	{
		name: "Piura",
		key: "PIU"
	},
	{
		name: "Puno",
		key: "PUN"
	},
	{
		name: "San Martín",
		key: "SAM"
	},
	{
		name: "Tacna",
		key: "TAC"
	},
	{
		name: "Tumbes",
		key: "TUM"
	},
	{
		name: "Ucayali",
		key: "UCA"
	}
];
var PG$2 = [
	{
		name: "Chimbu",
		key: "CPK"
	},
	{
		name: "Central",
		key: "CPM"
	},
	{
		name: "East New Britain",
		key: "EBR"
	},
	{
		name: "Eastern Highlands",
		key: "EHG"
	},
	{
		name: "Enga",
		key: "EPW"
	},
	{
		name: "East Sepik",
		key: "ESW"
	},
	{
		name: "Gulf",
		key: "GPK"
	},
	{
		name: "Hela",
		key: "HLA"
	},
	{
		name: "Jiwaka",
		key: "JWK"
	},
	{
		name: "Milne Bay",
		key: "MBA"
	},
	{
		name: "Morobe",
		key: "MPL"
	},
	{
		name: "Madang",
		key: "MPM"
	},
	{
		name: "Manus",
		key: "MRL"
	},
	{
		name: "National Capital District",
		key: "NCD"
	},
	{
		name: "New Ireland",
		key: "NIK"
	},
	{
		name: "Northern",
		key: "NPP"
	},
	{
		name: "Bougainville",
		key: "NSB"
	},
	{
		name: "West Sepik",
		key: "SAN"
	},
	{
		name: "Southern Highlands",
		key: "SHM"
	},
	{
		name: "West New Britain",
		key: "WBK"
	},
	{
		name: "Western Highlands",
		key: "WHM"
	},
	{
		name: "Western",
		key: "WPD"
	}
];
var PH$2 = [
	{
		name: "Abra",
		key: "ABR"
	},
	{
		name: "Agusan del Norte",
		key: "AGN"
	},
	{
		name: "Agusan del Sur",
		key: "AGS"
	},
	{
		name: "Aklan",
		key: "AKL"
	},
	{
		name: "Albay",
		key: "ALB"
	},
	{
		name: "Antique",
		key: "ANT"
	},
	{
		name: "Apayao",
		key: "APA"
	},
	{
		name: "Aurora",
		key: "AUR"
	},
	{
		name: "Batasn",
		key: "BAN"
	},
	{
		name: "Basilan",
		key: "BAS"
	},
	{
		name: "Benguet",
		key: "BEN"
	},
	{
		name: "Biliran",
		key: "BIL"
	},
	{
		name: "Bohol",
		key: "BOH"
	},
	{
		name: "Batangas",
		key: "BTG"
	},
	{
		name: "Batanes",
		key: "BTN"
	},
	{
		name: "Bukidnon",
		key: "BUK"
	},
	{
		name: "Bulacan",
		key: "BUL"
	},
	{
		name: "Cagayan",
		key: "CAG"
	},
	{
		name: "Camiguin",
		key: "CAM"
	},
	{
		name: "Camarines Norte",
		key: "CAN"
	},
	{
		name: "Capiz",
		key: "CAP"
	},
	{
		name: "Camarines Sur",
		key: "CAS"
	},
	{
		name: "Catanduanes",
		key: "CAT"
	},
	{
		name: "Cavite",
		key: "CAV"
	},
	{
		name: "Cebu",
		key: "CEB"
	},
	{
		name: "Compostela Valley",
		key: "COM"
	},
	{
		name: "Davao Oriental",
		key: "DAO"
	},
	{
		name: "Davao del Sur",
		key: "DAS"
	},
	{
		name: "Davao del Norte",
		key: "DAV"
	},
	{
		name: "Dinagat Islands",
		key: "DIN"
	},
	{
		name: "Eastern Samar",
		key: "EAS"
	},
	{
		name: "Guimaras",
		key: "GUI"
	},
	{
		name: "Ifugao",
		key: "IFU"
	},
	{
		name: "Iloilo",
		key: "ILI"
	},
	{
		name: "Ilocos Norte",
		key: "ILN"
	},
	{
		name: "Ilocos Sur",
		key: "ILS"
	},
	{
		name: "Isabela",
		key: "ISA"
	},
	{
		name: "Kalinga-Apayso",
		key: "KAL"
	},
	{
		name: "Laguna",
		key: "LAG"
	},
	{
		name: "Lanao del Norte",
		key: "LAN"
	},
	{
		name: "Lanao del Sur",
		key: "LAS"
	},
	{
		name: "Leyte",
		key: "LEY"
	},
	{
		name: "La Union",
		key: "LUN"
	},
	{
		name: "Marinduque",
		key: "MAD"
	},
	{
		name: "Maguindanao",
		key: "MAG"
	},
	{
		name: "Masbate",
		key: "MAS"
	},
	{
		name: "Mindoro Occidental",
		key: "MDC"
	},
	{
		name: "Mindoro Oriental",
		key: "MDR"
	},
	{
		name: "Mountain Province",
		key: "MOU"
	},
	{
		name: "Misamis Occidental",
		key: "MSC"
	},
	{
		name: "Misamis Oriental",
		key: "MSR"
	},
	{
		name: "North Cotabato",
		key: "NCO"
	},
	{
		name: "Negros Occidental",
		key: "NEC"
	},
	{
		name: "Negros Oriental",
		key: "NER"
	},
	{
		name: "Northern Samar",
		key: "NSA"
	},
	{
		name: "Nueva Ecija",
		key: "NUE"
	},
	{
		name: "Nueva Vizcaya",
		key: "NUV"
	},
	{
		name: "Pampanga",
		key: "PAM"
	},
	{
		name: "Pangasinan",
		key: "PAN"
	},
	{
		name: "Palawan",
		key: "PLW"
	},
	{
		name: "Quezon",
		key: "QUE"
	},
	{
		name: "Quirino",
		key: "QUI"
	},
	{
		name: "Rizal",
		key: "RIZ"
	},
	{
		name: "Romblon",
		key: "ROM"
	},
	{
		name: "Sarangani",
		key: "SAR"
	},
	{
		name: "South Cotabato",
		key: "SCO"
	},
	{
		name: "Siquijor",
		key: "SIG"
	},
	{
		name: "Southern Leyte",
		key: "SLE"
	},
	{
		name: "Sulu",
		key: "SLU"
	},
	{
		name: "Sorsogon",
		key: "SOR"
	},
	{
		name: "Sultan Kudarat",
		key: "SUK"
	},
	{
		name: "Surigao del Norte",
		key: "SUN"
	},
	{
		name: "Surigao del Sur",
		key: "SUR"
	},
	{
		name: "Tarlac",
		key: "TAR"
	},
	{
		name: "Tawi-Tawi",
		key: "TAW"
	},
	{
		name: "Western Samar",
		key: "WSA"
	},
	{
		name: "Zamboanga del Norte",
		key: "ZAN"
	},
	{
		name: "Zamboanga del Sur",
		key: "ZAS"
	},
	{
		name: "Zambales",
		key: "ZMB"
	},
	{
		name: "Zamboanga Sibugay",
		key: "ZSI"
	}
];
var PK$2 = [
	{
		name: "Balochistan",
		key: "BA"
	},
	{
		name: "Gilgit-Baltistan",
		key: "GB"
	},
	{
		name: "Islamabad",
		key: "IS"
	},
	{
		name: "Azad Jammu and Kashmir",
		key: "JK"
	},
	{
		name: "Khyber Pakhtunkhwa",
		key: "KP"
	},
	{
		name: "Punjab",
		key: "PB"
	},
	{
		name: "Sindh",
		key: "SD"
	},
	{
		name: "Federally Administered Tribal Areas",
		key: "TA"
	}
];
var PL$3 = [
	{
		name: {
			"default": "województwo łódzkie",
			alt_en: "Łódź Voivodeship"
		},
		key: "10"
	},
	{
		name: {
			"default": "województwo małopolskie",
			alt_en: "Lesser Poland Voivodeship"
		},
		key: "12"
	},
	{
		name: {
			"default": "województwo mazowieckie",
			alt_en: "Masovian Voivodeship"
		},
		key: "14"
	},
	{
		name: {
			"default": "województwo opolskie",
			alt_en: "Opole Voivodeship"
		},
		key: "16"
	},
	{
		name: {
			"default": "województwo podkarpackie",
			alt_en: "Subcarpathian Voivodeship"
		},
		key: "18"
	},
	{
		name: {
			"default": "województwo podlaskie",
			alt_en: "Podlaskie Voivodeship"
		},
		key: "20"
	},
	{
		name: {
			"default": "województwo pomorskie",
			alt_en: "Pomeranian Voivodeship"
		},
		key: "22"
	},
	{
		name: {
			"default": "województwo śląskie",
			alt_en: "Silesian Voivodeship"
		},
		key: "24"
	},
	{
		name: {
			"default": "województwo świętokrzyskie",
			alt_en: "Świętokrzyskie Voivodeship"
		},
		key: "26"
	},
	{
		name: {
			"default": "województwo warmińsko-mazurskie",
			alt_en: "Warmian-Masurian Voivodeship"
		},
		key: "28"
	},
	{
		name: {
			"default": "województwo wielkopolskie",
			alt_en: "Greater Poland Voivodeship"
		},
		key: "30"
	},
	{
		name: {
			"default": "województwo zachodniopomorskie",
			alt_en: "West Pomeranian Voivodeship"
		},
		key: "32"
	},
	{
		name: {
			"default": "województwo dolnośląskie",
			alt_en: "Lower Silesian Voivodeship"
		},
		key: "02"
	},
	{
		name: {
			"default": "województwo kujawsko-pomorskie",
			alt_en: "Kuyavian-Pomeranian Voivodeship"
		},
		key: "04"
	},
	{
		name: {
			"default": "województwo lubelskie",
			alt_en: "Lublin Voivodeship"
		},
		key: "06"
	},
	{
		name: {
			"default": "województwo lubuskie",
			alt_en: "Lubusz Voivodeship"
		},
		key: "08"
	}
];
var QA$2 = [
	{
		name: {
			"default": "الدوحة",
			alt_en: "Doha"
		},
		key: "DA"
	},
	{
		name: {
			"default": "الخور والذخيرة",
			alt_en: "Al Khor and Al Thakhira"
		},
		key: "KH"
	},
	{
		name: {
			"default": "الشمال",
			alt_en: "Ash Shamal"
		},
		key: "MS"
	},
	{
		name: {
			"default": "الريان",
			alt_en: "Ar Rayyan"
		},
		key: "RA"
	},
	{
		name: {
			"default": "الشحانية",
			alt_en: "Al Shahaniya"
		},
		key: "SH"
	},
	{
		name: {
			"default": "أم صلال",
			alt_en: "Umm Salal"
		},
		key: "US"
	},
	{
		name: {
			"default": "الوكرة",
			alt_en: "Al Wakrah"
		},
		key: "WA"
	},
	{
		name: {
			"default": "الضعاين",
			alt_en: "Al Daayen"
		},
		key: "ZA"
	}
];
var RO$3 = [
	{
		name: "Alba",
		key: "AB"
	},
	{
		name: "Argeş",
		key: "AG"
	},
	{
		name: "Arad",
		key: "AR"
	},
	{
		name: "Bucureşti",
		key: "B"
	},
	{
		name: "Bacău",
		key: "BC"
	},
	{
		name: "Bihor",
		key: "BH"
	},
	{
		name: "Bistriţa-Năsăud",
		key: "BN"
	},
	{
		name: "Brāila",
		key: "BR"
	},
	{
		name: "Botoşani",
		key: "BT"
	},
	{
		name: "Braşov",
		key: "BV"
	},
	{
		name: "Buzău",
		key: "BZ"
	},
	{
		name: "Cluj",
		key: "CJ"
	},
	{
		name: "Călărasi",
		key: "CL"
	},
	{
		name: "Caraş-Severin",
		key: "CS"
	},
	{
		name: "Constarţa",
		key: "CT"
	},
	{
		name: "Covasna",
		key: "CV"
	},
	{
		name: "Dâmboviţa",
		key: "DB"
	},
	{
		name: "Dolj",
		key: "DJ"
	},
	{
		name: "Gorj",
		key: "GJ"
	},
	{
		name: "Galaţi",
		key: "GL"
	},
	{
		name: "Giurgiu",
		key: "GR"
	},
	{
		name: "Hunedoara",
		key: "HD"
	},
	{
		name: "Harghita",
		key: "HR"
	},
	{
		name: "Ilfov",
		key: "IF"
	},
	{
		name: "Ialomiţa",
		key: "IL"
	},
	{
		name: "Iaşi",
		key: "IS"
	},
	{
		name: "Mehedinţi",
		key: "MH"
	},
	{
		name: "Maramureş",
		key: "MM"
	},
	{
		name: "Mureş",
		key: "MS"
	},
	{
		name: "Neamţ",
		key: "NT"
	},
	{
		name: "Olt",
		key: "OT"
	},
	{
		name: "Prahova",
		key: "PH"
	},
	{
		name: "Sibiu",
		key: "SB"
	},
	{
		name: "Sălaj",
		key: "SJ"
	},
	{
		name: "Satu Mare",
		key: "SM"
	},
	{
		name: "Suceava",
		key: "SV"
	},
	{
		name: "Tulcea",
		key: "TL"
	},
	{
		name: "Timiş",
		key: "TM"
	},
	{
		name: "Teleorman",
		key: "TR"
	},
	{
		name: "Vâlcea",
		key: "VL"
	},
	{
		name: "Vrancea",
		key: "VN"
	},
	{
		name: "Vaslui",
		key: "VS"
	}
];
var SB$2 = [
	{
		name: "Central Province",
		key: "CE"
	},
	{
		name: "Choiseul Province",
		key: "CH"
	},
	{
		name: "Capital Territory",
		key: "CT"
	},
	{
		name: "Guadalcanal Province",
		key: "GU"
	},
	{
		name: "Isabel Province",
		key: "IS"
	},
	{
		name: "Makira Province",
		key: "MK"
	},
	{
		name: "Malaita Province",
		key: "ML"
	},
	{
		name: "Rennell and Bellona Province",
		key: "RB"
	},
	{
		name: "Temotu Province",
		key: "TE"
	},
	{
		name: "Western Province",
		key: "WE"
	}
];
var SD$2 = [
	{
		name: {
			"default": "ولاية وسط دارفور",
			alt_en: "Central Darfur"
		},
		key: "DC"
	},
	{
		name: {
			"default": "ولاية شرق دارفور",
			alt_en: "East Darfur State"
		},
		key: "DE"
	},
	{
		name: {
			"default": "ولاية شمال دارفور",
			alt_en: "North Darfur State"
		},
		key: "DN"
	},
	{
		name: {
			"default": "جنوب دارفور",
			alt_en: "South Darfur State"
		},
		key: "DS"
	},
	{
		name: {
			"default": "ولاية غرب دارفور",
			alt_en: "West Darfur State"
		},
		key: "DW"
	},
	{
		name: {
			"default": "القضارف",
			alt_en: "Gedarif State"
		},
		key: "GD"
	},
	{
		name: {
			"default": "ولاية غرب كردفان",
			alt_en: "West Kurdufan"
		},
		key: "GK"
	},
	{
		name: {
			"default": "ولاية الجزيرة",
			alt_en: "Gezira State"
		},
		key: "GZ"
	},
	{
		name: {
			"default": "كسلا",
			alt_en: "Kassala"
		},
		key: "KA"
	},
	{
		name: {
			"default": "ولاية الخرطوم",
			alt_en: "Khartoum State"
		},
		key: "KH"
	},
	{
		name: {
			"default": "ولاية شمال كردفان",
			alt_en: "North Kordofan State"
		},
		key: "KN"
	},
	{
		name: {
			"default": "ولاية جنوب كردفان",
			alt_en: "South Kordofan State"
		},
		key: "KS"
	},
	{
		name: {
			"default": "ولاية النيل الأزرق",
			alt_en: "Blue Nile State"
		},
		key: "NB"
	},
	{
		name: {
			"default": "الولاية الشمالية",
			alt_en: "Northern State"
		},
		key: "NO"
	},
	{
		name: {
			"default": "نهر النيل",
			alt_en: "River Nile"
		},
		key: "NR"
	},
	{
		name: {
			"default": "ولاية النيل الأبيض",
			alt_en: "White Nile State"
		},
		key: "NW"
	},
	{
		name: {
			"default": "البحر الأحمر",
			alt_en: "Red Sea State"
		},
		key: "RS"
	},
	{
		name: {
			"default": "سنار",
			alt_en: "Sennar State"
		},
		key: "SI"
	}
];
var SE$2 = [
	{
		name: "Stockholms län",
		key: "AB"
	},
	{
		name: "Västerbottens län",
		key: "AC"
	},
	{
		name: "Norrbottens län",
		key: "BD"
	},
	{
		name: "Uppsala län",
		key: "C"
	},
	{
		name: "Södermanlands län",
		key: "D"
	},
	{
		name: "Östergötlands län",
		key: "E"
	},
	{
		name: "Jönköpings län",
		key: "F"
	},
	{
		name: "Kronoborgs län",
		key: "G"
	},
	{
		name: "Kalmar län",
		key: "H"
	},
	{
		name: "Gotlands län",
		key: "I"
	},
	{
		name: "Blekinge län",
		key: "K"
	},
	{
		name: "Skåne län",
		key: "M"
	},
	{
		name: "Hallands län",
		key: "N"
	},
	{
		name: "Västra Götalands län",
		key: "O"
	},
	{
		name: "Värmlands län",
		key: "S"
	},
	{
		name: "Örebro län",
		key: "T"
	},
	{
		name: "Västmanlands län",
		key: "U"
	},
	{
		name: "Dalarnes län",
		key: "W"
	},
	{
		name: "Gävleborgs län",
		key: "X"
	},
	{
		name: "Västernorrlands län",
		key: "Y"
	},
	{
		name: "Jämtlands län",
		key: "Z"
	}
];
var SH$2 = [
	{
		name: "Ascension",
		key: "AC"
	},
	{
		name: "Saint Helena",
		key: "HL"
	},
	{
		name: "Tristan da Cunha",
		key: "TA"
	}
];
var SK$3 = [
	{
		name: {
			"default": "Banskobystrický kraj",
			alt_en: "Region of Banská Bystrica"
		},
		key: "BC"
	},
	{
		name: {
			"default": "Bratislavský kraj",
			alt_en: "Region of Bratislava"
		},
		key: "BL"
	},
	{
		name: {
			"default": "Košický kraj",
			alt_en: "Region of Košice"
		},
		key: "KI"
	},
	{
		name: {
			"default": "Nitrianský kraj",
			alt_en: "Region of Nitra"
		},
		key: "NI"
	},
	{
		name: {
			"default": "Prešovský kraj",
			alt_en: "Region of Prešov"
		},
		key: "PV"
	},
	{
		name: {
			"default": "Trnavský kraj",
			alt_en: "Region of Trnava"
		},
		key: "TA"
	},
	{
		name: {
			"default": "Trenčianský kraj",
			alt_en: "Region of Trenčín"
		},
		key: "TC"
	},
	{
		name: {
			"default": "Žilinský kraj",
			alt_en: "Region of Žilina"
		},
		key: "ZI"
	}
];
var SL$3 = [
	{
		name: "Eastern",
		key: "E"
	},
	{
		name: "Northern",
		key: "N"
	},
	{
		name: "Southern",
		key: "S"
	},
	{
		name: "Western Area",
		key: "W"
	}
];
var SN$2 = [
	{
		name: "Diourbel",
		key: "DB"
	},
	{
		name: "Dakar",
		key: "DK"
	},
	{
		name: "Fatick",
		key: "FK"
	},
	{
		name: "Kaffrine",
		key: "KA"
	},
	{
		name: "Kolda",
		key: "KD"
	},
	{
		name: "Kédougou",
		key: "KE"
	},
	{
		name: "Kaolack",
		key: "KL"
	},
	{
		name: "Louga",
		key: "LG"
	},
	{
		name: "Matam",
		key: "MT"
	},
	{
		name: "Sédhiou",
		key: "SE"
	},
	{
		name: "Saint-Louis",
		key: "SL"
	},
	{
		name: "Tambacounda",
		key: "TC"
	},
	{
		name: "Thiès",
		key: "TH"
	},
	{
		name: "Ziguinchor",
		key: "ZG"
	}
];
var SO$2 = [
	{
		name: "Awdal",
		key: "AW"
	},
	{
		name: "Bakool",
		key: "BK"
	},
	{
		name: "Banaadir",
		key: "BN"
	},
	{
		name: "Bari",
		key: "BR"
	},
	{
		name: "Bay",
		key: "BY"
	},
	{
		name: "Galguduud",
		key: "GA"
	},
	{
		name: "Gedo",
		key: "GE"
	},
	{
		name: "Hiiraan",
		key: "HI"
	},
	{
		name: "Jubbada Dhexe",
		key: "JD"
	},
	{
		name: "Jubbada Hoose",
		key: "JH"
	},
	{
		name: "Mudug",
		key: "MU"
	},
	{
		name: "Nugaal",
		key: "NU"
	},
	{
		name: "Sanaag",
		key: "SA"
	},
	{
		name: "Shabeellaha Dhexe",
		key: "SD"
	},
	{
		name: "Shabeellaha Hoose",
		key: "SH"
	},
	{
		name: "Sool",
		key: "SO"
	},
	{
		name: "Togdheer",
		key: "TO"
	},
	{
		name: "Woqooyi Galbeed",
		key: "WO"
	}
];
var SR$2 = [
	{
		name: "Brokopondo",
		key: "BR"
	},
	{
		name: "Commewijne",
		key: "CM"
	},
	{
		name: "Coronie",
		key: "CR"
	},
	{
		name: "Marowijne",
		key: "MA"
	},
	{
		name: "Nickerie",
		key: "NI"
	},
	{
		name: "Paramaribo",
		key: "PM"
	},
	{
		name: "Para",
		key: "PR"
	},
	{
		name: "Saramacca",
		key: "SA"
	},
	{
		name: "Sipaliwini",
		key: "SI"
	},
	{
		name: "Wanica",
		key: "WA"
	}
];
var SS$2 = [
	{
		name: "Northern Bahr el Ghazal",
		key: "BN"
	},
	{
		name: "Western Bahr el Ghazal",
		key: "BW"
	},
	{
		name: "Central Equatoria",
		key: "EC"
	},
	{
		name: "Eastern Equatoria",
		key: "EE"
	},
	{
		name: "Western Equatoria",
		key: "EW"
	},
	{
		name: "Jonglei",
		key: "JG"
	},
	{
		name: "Lakes",
		key: "LK"
	},
	{
		name: "Upper Nile",
		key: "NU"
	},
	{
		name: "Unity",
		key: "UY"
	},
	{
		name: "Warrap",
		key: "WR"
	}
];
var ST$2 = [
	{
		name: {
			"default": "Província de Príncipe",
			alt_en: "Príncipe Province"
		},
		key: "P"
	},
	{
		name: {
			"default": "Província de São Tomé",
			alt_en: "São Tomé Province"
		},
		key: "S"
	}
];
var SV$3 = [
	{
		name: "Departamento de Ahuachapán",
		key: "AH"
	},
	{
		name: "Departamento de Cabañas",
		key: "CA"
	},
	{
		name: "Departamento de Chalatenango",
		key: "CH"
	},
	{
		name: "Departamento de Cuscatlán",
		key: "CU"
	},
	{
		name: "La Libertad",
		key: "LI"
	},
	{
		name: "Departamento de Morazán",
		key: "MO"
	},
	{
		name: "Departamento de La Paz",
		key: "PA"
	},
	{
		name: "Departamento de Santa Ana",
		key: "SA"
	},
	{
		name: "Departamento de San Miguel",
		key: "SM"
	},
	{
		name: "Departamento de Sonsonate",
		key: "SO"
	},
	{
		name: "Departamento de San Salvador",
		key: "SS"
	},
	{
		name: "San Vicente",
		key: "SV"
	},
	{
		name: "Departamento de La Unión",
		key: "UN"
	},
	{
		name: "Departamento de Usulután",
		key: "US"
	}
];
var SY$2 = [
	{
		name: {
			"default": "محافظة دمشق",
			alt_en: "Damascus Governorate"
		},
		key: "DI"
	},
	{
		name: {
			"default": "محافظة درعا",
			alt_en: "Daraa Governorate"
		},
		key: "DR"
	},
	{
		name: {
			"default": "محافظة دير الزور",
			alt_en: "Deir Ezzor Governorate"
		},
		key: "DY"
	},
	{
		name: {
			"default": "محافظة الحسكة",
			alt_en: "Al-Hasaka Governorate"
		},
		key: "HA"
	},
	{
		name: {
			"default": "محافظة حمص",
			alt_en: "Homs Governorate"
		},
		key: "HI"
	},
	{
		name: {
			"default": "محافظة حلب",
			alt_en: "Aleppo Governorate"
		},
		key: "HL"
	},
	{
		name: {
			"default": "محافظة حماة",
			alt_en: "Hama Governorate"
		},
		key: "HM"
	},
	{
		name: {
			"default": "محافظة إدلب",
			alt_en: "Idlib Governorate"
		},
		key: "ID"
	},
	{
		name: {
			"default": "محافظة اللاذقية",
			alt_en: "Latakia Governorate"
		},
		key: "LA"
	},
	{
		name: {
			"default": "محافظة القنيطرة",
			alt_en: "Al-Qunaitra Governorate"
		},
		key: "QU"
	},
	{
		name: {
			"default": "محافظة الرقة",
			alt_en: "Ar-Raqqah Governorate"
		},
		key: "RA"
	},
	{
		name: {
			"default": "محافظة ريف دمشق",
			alt_en: "Rif Dimashq Governorate"
		},
		key: "RD"
	},
	{
		name: {
			"default": "محافظة السويداء",
			alt_en: "As-Suwayda Governorate"
		},
		key: "SU"
	},
	{
		name: {
			"default": "محافظة طرطوس",
			alt_en: "Tartus Governorate"
		},
		key: "TA"
	}
];
var SZ$2 = [
	{
		name: "Hhohho",
		key: "HH"
	},
	{
		name: "Lubombo",
		key: "LU"
	},
	{
		name: "Manzini",
		key: "MA"
	},
	{
		name: "Shiselweni",
		key: "SH"
	}
];
var TD$2 = [
	{
		name: "Batha",
		key: "BA"
	},
	{
		name: "Baḩr al Ghazāl",
		key: "BG"
	},
	{
		name: "Būrkū",
		key: "BO"
	},
	{
		name: "Chari-Baguirmi",
		key: "CB"
	},
	{
		name: "Ennedi-Est",
		key: "EE"
	},
	{
		name: "Ennedi-Ouest",
		key: "EO"
	},
	{
		name: "Guéra",
		key: "GR"
	},
	{
		name: "Hadjer Lamis",
		key: "HL"
	},
	{
		name: "Kanem",
		key: "KA"
	},
	{
		name: "Lac",
		key: "LC"
	},
	{
		name: "Logone-Occidental",
		key: "LO"
	},
	{
		name: "Logone-Oriental",
		key: "LR"
	},
	{
		name: "Mandoul",
		key: "MA"
	},
	{
		name: "Moyen-Chari",
		key: "MC"
	},
	{
		name: "Mayo‐Kebbi‐Est",
		key: "ME"
	},
	{
		name: "Mayo‐Kebbi‐Ouest",
		key: "MO"
	},
	{
		name: "Ville de Ndjamena",
		key: "ND"
	},
	{
		name: "Ouaddaï",
		key: "OD"
	},
	{
		name: "Salamat",
		key: "SA"
	},
	{
		name: "Sīlā",
		key: "SI"
	},
	{
		name: "Tandjilé",
		key: "TA"
	},
	{
		name: "Tibastī",
		key: "TI"
	},
	{
		name: "Wadi Fira",
		key: "WF"
	}
];
var TG$2 = [
	{
		name: "Centrale",
		key: "C"
	},
	{
		name: "Kara",
		key: "K"
	},
	{
		name: "Maritime",
		key: "M"
	},
	{
		name: "Plateaux",
		key: "P"
	},
	{
		name: "Savanes",
		key: "S"
	}
];
var TJ$2 = [
	{
		name: {
			"default": "Душанбе",
			alt_en: "Dushanbe"
		},
		key: "DU"
	},
	{
		name: {
			"default": "Вилояти Мухтори Кӯҳистони Бадахшон",
			alt_en: "Gorno-Badakhshan Autonomous Region"
		},
		key: "GB"
	},
	{
		name: {
			"default": "Вилояти Хатлон",
			alt_en: "Khatlon Region"
		},
		key: "KT"
	},
	{
		name: {
			"default": "Ноҳияҳои тобеи ҷумҳурӣ",
			alt_en: "Districts of Republican Subordination"
		},
		key: "RA"
	},
	{
		name: {
			"default": "Вилояти Суғд",
			alt_en: "Sughd Region"
		},
		key: "SU"
	}
];
var TL$2 = [
	{
		name: "Aileu",
		key: "AL"
	},
	{
		name: "Ainaro",
		key: "AN"
	},
	{
		name: "Baucau",
		key: "BA"
	},
	{
		name: "Bobonaro",
		key: "BO"
	},
	{
		name: "Cova Lima",
		key: "CO"
	},
	{
		name: "Díli",
		key: "DI"
	},
	{
		name: "Ermera",
		key: "ER"
	},
	{
		name: "Lautem",
		key: "LA"
	},
	{
		name: "Liquiça",
		key: "LI"
	},
	{
		name: "Manufahi",
		key: "MF"
	},
	{
		name: "Manatuto",
		key: "MT"
	},
	{
		name: "Oecussi",
		key: "OE"
	},
	{
		name: "Viqueque",
		key: "VI"
	}
];
var TT$2 = [
	{
		name: "Arima",
		key: "ARI"
	},
	{
		name: "Chaguanas",
		key: "CHA"
	},
	{
		name: "Couva-Tabaquite-Talparo",
		key: "CTT"
	},
	{
		name: "Diego Martin",
		key: "DMN"
	},
	{
		name: "Mayaro-Rio Claro",
		key: "MRC"
	},
	{
		name: "Penal-Debe",
		key: "PED"
	},
	{
		name: "Port of Spain",
		key: "POS"
	},
	{
		name: "Princes Town",
		key: "PRT"
	},
	{
		name: "Point Fortin",
		key: "PTF"
	},
	{
		name: "San Fernando",
		key: "SFO"
	},
	{
		name: "Sangre Grande",
		key: "SGE"
	},
	{
		name: "Siparia",
		key: "SIP"
	},
	{
		name: "San Juan-Laventille",
		key: "SJL"
	},
	{
		name: "Tobago",
		key: "TOB"
	},
	{
		name: "Tunapuna-Piarco",
		key: "TUP"
	}
];
var US$2 = [
	{
		name: "Alabama",
		key: "AL"
	},
	{
		name: "Alaska",
		key: "AK"
	},
	{
		name: "American Samoa",
		key: "AS"
	},
	{
		name: "Arizona",
		key: "AZ"
	},
	{
		name: "Arkansas",
		key: "AR"
	},
	{
		name: "California",
		key: "CA"
	},
	{
		name: "Colorado",
		key: "CO"
	},
	{
		name: "Connecticut",
		key: "CT"
	},
	{
		name: "Delaware",
		key: "DE"
	},
	{
		name: "District of Columbia",
		key: "DC"
	},
	{
		name: "Florida",
		key: "FL"
	},
	{
		name: "Micronesia",
		key: "FM"
	},
	{
		name: "Georgia",
		key: "GA"
	},
	{
		name: "Guam",
		key: "GU"
	},
	{
		name: "Hawaii",
		key: "HI"
	},
	{
		name: "Idaho",
		key: "ID"
	},
	{
		name: "Illinois",
		key: "IL"
	},
	{
		name: "Indiana",
		key: "IN"
	},
	{
		name: "Iowa",
		key: "IA"
	},
	{
		name: "Kansas",
		key: "KS"
	},
	{
		name: "Kentucky",
		key: "KY"
	},
	{
		name: "Louisiana",
		key: "LA"
	},
	{
		name: "Maine",
		key: "ME"
	},
	{
		name: "Maryland",
		key: "MD"
	},
	{
		name: "Massachusetts",
		key: "MA"
	},
	{
		name: "Marshall Islands",
		key: "MH"
	},
	{
		name: "Michigan",
		key: "MI"
	},
	{
		name: "Minnesota",
		key: "MN"
	},
	{
		name: "Mississippi",
		key: "MS"
	},
	{
		name: "Missouri",
		key: "MO"
	},
	{
		name: "Northern Mariana Islands",
		key: "MP"
	},
	{
		name: "Montana",
		key: "MT"
	},
	{
		name: "Nebraska",
		key: "NE"
	},
	{
		name: "Nevada",
		key: "NV"
	},
	{
		name: "New Hampshire",
		key: "NH"
	},
	{
		name: "New Jersey",
		key: "NJ"
	},
	{
		name: "New Mexico",
		key: "NM"
	},
	{
		name: "New York",
		key: "NY"
	},
	{
		name: "North Carolina",
		key: "NC"
	},
	{
		name: "North Dakota",
		key: "ND"
	},
	{
		name: "Ohio",
		key: "OH"
	},
	{
		name: "Oklahoma",
		key: "OK"
	},
	{
		name: "Oregon",
		key: "OR"
	},
	{
		name: "Pennsylvania",
		key: "PA"
	},
	{
		name: "Puerto Rico",
		key: "PR"
	},
	{
		name: "Palau",
		key: "PW"
	},
	{
		name: "Rhode Island",
		key: "RI"
	},
	{
		name: "South Carolina",
		key: "SC"
	},
	{
		name: "South Dakota",
		key: "SD"
	},
	{
		name: "Tennessee",
		key: "TN"
	},
	{
		name: "Texas",
		key: "TX"
	},
	{
		name: "US Minor Outlying Islands",
		key: "UM"
	},
	{
		name: "Utah",
		key: "UT"
	},
	{
		name: "Vermont",
		key: "VT"
	},
	{
		name: "Virginia",
		key: "VA"
	},
	{
		name: "US Virgin Islands",
		key: "VI"
	},
	{
		name: "Washington",
		key: "WA"
	},
	{
		name: "West Virginia",
		key: "WV"
	},
	{
		name: "Wisconsin",
		key: "WI"
	},
	{
		name: "Wyoming",
		key: "WY"
	}
];
var UY$2 = [
	{
		name: "Artigas",
		key: "AR"
	},
	{
		name: "Canelones",
		key: "CA"
	},
	{
		name: "Cerro Largo",
		key: "CL"
	},
	{
		name: "Colonia",
		key: "CO"
	},
	{
		name: "Durazno",
		key: "DU"
	},
	{
		name: "Florida",
		key: "FD"
	},
	{
		name: "Flores",
		key: "FS"
	},
	{
		name: "Lavalleja",
		key: "LA"
	},
	{
		name: "Maldonado",
		key: "MA"
	},
	{
		name: "Montevideo",
		key: "MO"
	},
	{
		name: "Paysandú",
		key: "PA"
	},
	{
		name: "Río Negro",
		key: "RN"
	},
	{
		name: "Rocha",
		key: "RO"
	},
	{
		name: "Rivera",
		key: "RV"
	},
	{
		name: "Salto",
		key: "SA"
	},
	{
		name: "San José",
		key: "SJ"
	},
	{
		name: "Soriano",
		key: "SO"
	},
	{
		name: "Tacuarembó",
		key: "TA"
	},
	{
		name: "Treinta y Tres",
		key: "TT"
	}
];
var UZ$2 = [
	{
		name: "Andijon Region",
		key: "AN"
	},
	{
		name: "Bukhara Region",
		key: "BU"
	},
	{
		name: "Fergana Region",
		key: "FA"
	},
	{
		name: "Jizzakh Region",
		key: "JI"
	},
	{
		name: "Namangan Region",
		key: "NG"
	},
	{
		name: "Navoiy Region",
		key: "NW"
	},
	{
		name: "Qashqadaryo Region",
		key: "QA"
	},
	{
		name: "Republic of Karakalpakstan",
		key: "QR"
	},
	{
		name: "Samarqand Region",
		key: "SA"
	},
	{
		name: "Sirdaryo Region",
		key: "SI"
	},
	{
		name: "Surxondaryo Region",
		key: "SU"
	},
	{
		name: "Tashkent",
		key: "TK"
	},
	{
		name: "Tashkent Region",
		key: "TO"
	},
	{
		name: "Xorazm Region",
		key: "XO"
	}
];
var VE$2 = [
	{
		name: "Distrito Capital",
		key: "A"
	},
	{
		name: "Anzoátegui",
		key: "B"
	},
	{
		name: "Apure",
		key: "C"
	},
	{
		name: "Aragua",
		key: "D"
	},
	{
		name: "Barinas",
		key: "E"
	},
	{
		name: "Bolívar",
		key: "F"
	},
	{
		name: "Carabobo",
		key: "G"
	},
	{
		name: "Cojedes",
		key: "H"
	},
	{
		name: "Falcón",
		key: "I"
	},
	{
		name: "Guárico",
		key: "J"
	},
	{
		name: "Lara",
		key: "K"
	},
	{
		name: "Mérida",
		key: "L"
	},
	{
		name: "Miranda",
		key: "M"
	},
	{
		name: "Monagas",
		key: "N"
	},
	{
		name: "Nueva Esparta",
		key: "O"
	},
	{
		name: "Portuguesa",
		key: "P"
	},
	{
		name: "Sucre",
		key: "R"
	},
	{
		name: "Táchira",
		key: "S"
	},
	{
		name: "Trujillo",
		key: "T"
	},
	{
		name: "Yaracuy",
		key: "U"
	},
	{
		name: "Zulia",
		key: "V"
	},
	{
		name: "Dependencias Federales",
		key: "W"
	},
	{
		name: "La Guaira",
		key: "X"
	},
	{
		name: "Delta Amacuro",
		key: "Y"
	},
	{
		name: "Amazonas",
		key: "Z"
	}
];
var VU$2 = [
	{
		name: "Malampa",
		key: "MAP"
	},
	{
		name: "Penama",
		key: "PAM"
	},
	{
		name: "Sanma",
		key: "SAM"
	},
	{
		name: "Shefa",
		key: "SEE"
	},
	{
		name: "Tafea",
		key: "TAE"
	},
	{
		name: "Torba",
		key: "TOB"
	}
];
var YE$2 = [
	{
		name: {
			"default": "محافظة أبين",
			alt_en: "Abyan Governorate"
		},
		key: "AB"
	},
	{
		name: {
			"default": "محافظة عدن",
			alt_en: "Aden Governorate"
		},
		key: "AD"
	},
	{
		name: {
			"default": "محافظة عمران",
			alt_en: "Amran Governorate"
		},
		key: "AM"
	},
	{
		name: {
			"default": "محافظة البيضاء",
			alt_en: "Al Bayda' Governorate"
		},
		key: "BA"
	},
	{
		name: {
			"default": "محافظة الضالع",
			alt_en: "Ad Dali' Governorate"
		},
		key: "DA"
	},
	{
		name: {
			"default": "محافظة ذمار",
			alt_en: "Dhamar Governorate"
		},
		key: "DH"
	},
	{
		name: {
			"default": "محافظة حضرموت",
			alt_en: "Hadramaut Governorate"
		},
		key: "HD"
	},
	{
		name: {
			"default": "محافظة حجة",
			alt_en: "Hajjah Governorate"
		},
		key: "HJ"
	},
	{
		name: {
			"default": "محافظة الحديدة",
			alt_en: "Al Hudaydah Governorate"
		},
		key: "HU"
	},
	{
		name: {
			"default": "محافظة إب",
			alt_en: "Ibb Governorate"
		},
		key: "IB"
	},
	{
		name: {
			"default": "محافظة الجوف",
			alt_en: "Al Jawf Governorate"
		},
		key: "JA"
	},
	{
		name: {
			"default": "محافظة لحج",
			alt_en: "Lahij Governorate"
		},
		key: "LA"
	},
	{
		name: {
			"default": "محافظة مأرب",
			alt_en: "Marib Governorate"
		},
		key: "MA"
	},
	{
		name: {
			"default": "محافظة المهرة",
			alt_en: "Al Mahrah Governorate"
		},
		key: "MR"
	},
	{
		name: {
			"default": "محافظة المحويت",
			alt_en: "Al Mahwit Governorate"
		},
		key: "MW"
	},
	{
		name: {
			"default": "محافظة ريمة",
			alt_en: "Raymah Governorate"
		},
		key: "RA"
	},
	{
		name: {
			"default": "أمانة العاصمة",
			alt_en: "Amanat Al Asimah"
		},
		key: "SA"
	},
	{
		name: {
			"default": "محافظة صعدة",
			alt_en: "Sa'dah Governorate"
		},
		key: "SD"
	},
	{
		name: {
			"default": "محافظة شبوة",
			alt_en: "Shabwah Governorate"
		},
		key: "SH"
	},
	{
		name: {
			"default": "محافظة صنعاء",
			alt_en: "Sana'a Governorate"
		},
		key: "SN"
	},
	{
		name: {
			"default": "محافظة أرخبيل سقطرى",
			alt_en: "Socotra Governorate"
		},
		key: "SU"
	},
	{
		name: {
			"default": "محافظة تعز",
			alt_en: "Ta'izz Governorate"
		},
		key: "TA"
	}
];
var ZA$2 = [
	{
		name: "Eastern Cape",
		key: "EC"
	},
	{
		name: "Free State",
		key: "FS"
	},
	{
		name: "Gauteng",
		key: "GT"
	},
	{
		name: "Limpopo",
		key: "LP"
	},
	{
		name: "Mpumalanga",
		key: "MP"
	},
	{
		name: "Northern Cape",
		key: "NC"
	},
	{
		name: "Kwazulu-Natal",
		key: "NL"
	},
	{
		name: "North-West",
		key: "NW"
	},
	{
		name: "Western Cape",
		key: "WC"
	}
];
var ZW$2 = [
	{
		name: "Bulawayo",
		key: "BU"
	},
	{
		name: "Harare",
		key: "HA"
	},
	{
		name: "Manicaland",
		key: "MA"
	},
	{
		name: "Mashonaland Central",
		key: "MC"
	},
	{
		name: "Mashonaland East",
		key: "ME"
	},
	{
		name: "Midlands",
		key: "MI"
	},
	{
		name: "Matabeleland North",
		key: "MN"
	},
	{
		name: "Matabeleland South",
		key: "MS"
	},
	{
		name: "Masvingo",
		key: "MV"
	},
	{
		name: "Mashonaland West",
		key: "MW"
	}
];
var stateCodes = {
	AE: AE$2,
	AF: AF$2,
	AM: AM$2,
	AO: AO$2,
	AR: AR$2,
	AT: AT$2,
	AU: AU$2,
	AZ: AZ$2,
	BA: BA$2,
	BD: BD$2,
	BE: BE$2,
	BF: BF$2,
	BI: BI$2,
	BJ: BJ$2,
	BN: BN$2,
	BO: BO$2,
	BR: BR$2,
	BW: BW$2,
	BY: BY$2,
	BZ: BZ$2,
	CA: CA$3,
	CD: CD$2,
	CF: CF$2,
	CH: CH$2,
	CI: CI$2,
	CL: CL$2,
	CM: CM$2,
	CO: CO$2,
	CR: CR$2,
	CV: CV$2,
	DE: DE$3,
	DJ: DJ$2,
	EC: EC$2,
	ER: ER$2,
	ES: ES$4,
	FJ: FJ$2,
	FM: FM$2,
	FR: FR$3,
	GB: GB$3,
	GE: GE$2,
	GH: GH$2,
	GL: GL$3,
	GM: GM$2,
	GN: GN$2,
	GQ: GQ$2,
	GT: GT$2,
	GW: GW$2,
	GY: GY$2,
	HN: HN$2,
	HT: HT$2,
	HU: HU$3,
	ID: ID$2,
	IE: IE$3,
	IN: IN$2,
	IT: IT$4,
	JO: JO$2,
	KG: KG$2,
	KI: KI$2,
	KM: KM$2,
	KN: KN$2,
	KW: KW$2,
	LA: LA$2,
	KZ: KZ$2,
	LB: LB$2,
	LR: LR$2,
	LS: LS$2,
	LT: LT$2,
	LY: LY$2,
	MD: MD$2,
	MG: MG$2,
	MU: MU$2,
	MW: MW$2,
	MX: MX$2,
	MY: MY$2,
	MZ: MZ$2,
	NA: NA$2,
	NG: NG$2,
	NI: NI$2,
	NL: NL$3,
	NZ: NZ$2,
	OM: OM$2,
	PE: PE$2,
	PG: PG$2,
	PH: PH$2,
	PK: PK$2,
	PL: PL$3,
	QA: QA$2,
	RO: RO$3,
	SB: SB$2,
	SD: SD$2,
	SE: SE$2,
	SH: SH$2,
	SK: SK$3,
	SL: SL$3,
	SN: SN$2,
	SO: SO$2,
	SR: SR$2,
	SS: SS$2,
	ST: ST$2,
	SV: SV$3,
	SY: SY$2,
	SZ: SZ$2,
	TD: TD$2,
	TG: TG$2,
	TJ: TJ$2,
	TL: TL$2,
	TT: TT$2,
	US: US$2,
	UY: UY$2,
	UZ: UZ$2,
	VE: VE$2,
	VU: VU$2,
	YE: YE$2,
	ZA: ZA$2,
	ZW: ZW$2
};

var ES$3 = [
	{
		name: "Alicante",
		key: "A"
	},
	{
		name: "Albacete",
		key: "AB"
	},
	{
		name: "Almería",
		key: "AL"
	},
	{
		name: "Ávila",
		key: "AV"
	},
	{
		name: {
			"default": "Barcelonés",
			alt_ca: "Barcelonès",
			alt_en: "Barcelona"
		},
		key: "B"
	},
	{
		name: "Badajoz",
		key: "BA"
	},
	{
		name: "Vizcaya",
		key: "BI"
	},
	{
		name: "Burgos",
		key: "BU"
	},
	{
		name: "A Coruña",
		key: "C"
	},
	{
		name: "Cádiz",
		key: "CA"
	},
	{
		name: "Cáceres",
		key: "CC"
	},
	{
		name: "Córdoba",
		key: "CO"
	},
	{
		name: "Ciudad Real",
		key: "CR"
	},
	{
		name: "Castellón",
		key: "CS"
	},
	{
		name: "Cuenca",
		key: "CU"
	},
	{
		name: "Las Palmas",
		key: "GC"
	},
	{
		name: {
			"default": "Gironés",
			alt_ca: "Gironès",
			alt_en: "Girona"
		},
		key: "GI"
	},
	{
		name: "Granada",
		key: "GR"
	},
	{
		name: "Guadalajara",
		key: "GU"
	},
	{
		name: "Huelva",
		key: "H"
	},
	{
		name: "Huesca",
		key: "HU"
	},
	{
		name: "Jaén",
		key: "J"
	},
	{
		name: {
			"default": "Lérida",
			alt_ca: "Lleida"
		},
		key: "L"
	},
	{
		name: "León",
		key: "LE"
	},
	{
		name: "La Rioja",
		key: "LO"
	},
	{
		name: "Lugo",
		key: "LU"
	},
	{
		name: "Comunidad de Madrid",
		key: "M"
	},
	{
		name: "Málaga",
		key: "MA"
	},
	{
		name: "Región de Murcia",
		key: "MU"
	},
	{
		name: "Navarra",
		key: "NA"
	},
	{
		name: "Asturias",
		key: "O"
	},
	{
		name: "Ourense",
		key: "OR"
	},
	{
		name: "Palencia",
		key: "P"
	},
	{
		name: "Islas Baleares",
		key: "PM"
	},
	{
		name: "Pontevedra",
		key: "PO"
	},
	{
		name: "Cantabria",
		key: "S"
	},
	{
		name: "Salamanca",
		key: "SA"
	},
	{
		name: "Sevilla",
		key: "SE"
	},
	{
		name: "Segovia",
		key: "SG"
	},
	{
		name: "Soria",
		key: "SO"
	},
	{
		name: "Guipúzcoa",
		key: "SS"
	},
	{
		name: "Tarragona",
		key: "T"
	},
	{
		name: "Teruel",
		key: "TE"
	},
	{
		name: "Santa Cruz de Tenerife",
		key: "TF"
	},
	{
		name: "Toledo",
		key: "TO"
	},
	{
		name: "Valencia",
		key: "V"
	},
	{
		name: "Valladolid",
		key: "VA"
	},
	{
		name: "Álava",
		key: "VI"
	},
	{
		name: "Zaragoza",
		key: "Z"
	},
	{
		name: "Zamora",
		key: "ZA"
	}
];
var GB$2 = [
	{
		name: "County Armagh",
		key: "ABC"
	},
	{
		name: "Aberdeenshire",
		key: "ABD"
	},
	{
		name: "Aberdeen City",
		key: "ABE"
	},
	{
		name: "Argyll and Bute",
		key: "AGB"
	},
	{
		name: "Isle of Anglesey",
		key: "AGY"
	},
	{
		name: "Ards and North Down",
		key: "AND"
	},
	{
		name: "Antrim and Newtownabbey",
		key: "ANN"
	},
	{
		name: "Angus",
		key: "ANS"
	},
	{
		name: "Armagh",
		key: "ARM"
	},
	{
		name: "Bath and North East Somerset",
		key: "BAS"
	},
	{
		name: "Blackburn with Darwen",
		key: "BBD"
	},
	{
		name: "Bedford",
		key: "BDF"
	},
	{
		name: "London Borough of Barking and Dagenham",
		key: "BDG"
	},
	{
		name: "London Borough of Brent",
		key: "BEN"
	},
	{
		name: "London Borough of Bexley",
		key: "BEX"
	},
	{
		name: "Belfast",
		key: "BFS"
	},
	{
		name: "Bridgend",
		key: "BGE"
	},
	{
		name: "Blaenau Gwent",
		key: "BGW"
	},
	{
		name: "Birmingham",
		key: "BIR"
	},
	{
		name: "Buckinghamshire",
		key: "BKM"
	},
	{
		name: "Bournemouth",
		key: "BMH"
	},
	{
		name: "London Borough of Barnet",
		key: "BNE"
	},
	{
		name: "Brighton and Hove",
		key: "BNH"
	},
	{
		name: "Barnsley",
		key: "BNS"
	},
	{
		name: "Bolton",
		key: "BOL"
	},
	{
		name: {
			"default": "Blackpool",
			alt: "Borough of Blackpool"
		},
		key: "BPL"
	},
	{
		name: "Bracknell Forest",
		key: "BRC"
	},
	{
		name: "Bradford",
		key: "BRD"
	},
	{
		name: "London Borough of Bromley",
		key: "BRY"
	},
	{
		name: "City of Bristol",
		key: "BST"
	},
	{
		name: "Bury",
		key: "BUR"
	},
	{
		name: "Cambridgeshire",
		key: "CAM"
	},
	{
		name: "Caerphilly",
		key: "CAY"
	},
	{
		name: "Central Bedfordshire",
		key: "CBF"
	},
	{
		name: "Causeway Coast and Glens",
		key: "CCG"
	},
	{
		name: "Ceredigion",
		key: "CGN"
	},
	{
		name: "Cheshire East",
		key: "CHE"
	},
	{
		name: "Cheshire West and Chester",
		key: "CHW"
	},
	{
		name: "Calderdale",
		key: "CLD"
	},
	{
		name: "Clackmannanshire",
		key: "CLK"
	},
	{
		name: "Cumbria",
		key: "CMA"
	},
	{
		name: "London Borough of Camden",
		key: "CMD"
	},
	{
		name: "Carmarthenshire",
		key: "CMN"
	},
	{
		name: "Cornwall",
		key: "CON"
	},
	{
		name: "Coventry",
		key: "COV"
	},
	{
		name: "Cardiff",
		key: "CRF"
	},
	{
		name: "London Borough of Croydon",
		key: "CRY"
	},
	{
		name: "Conwy",
		key: "CWY"
	},
	{
		name: "Darlington",
		key: "DAL"
	},
	{
		name: "Derbyshire",
		key: "DBY"
	},
	{
		name: "Denbighshire",
		key: "DEN"
	},
	{
		name: "Derby",
		key: "DER"
	},
	{
		name: "Devon",
		key: "DEV"
	},
	{
		name: "Dumfries and Galloway",
		key: "DGY"
	},
	{
		name: "Doncaster",
		key: "DNC"
	},
	{
		name: "Dundee City",
		key: "DND"
	},
	{
		name: "Dorset",
		key: "DOR"
	},
	{
		name: "Derry and Strabane",
		key: "DRS"
	},
	{
		name: "Dudley",
		key: "DUD"
	},
	{
		name: {
			"default": "Durham",
			alt: "County Durham"
		},
		key: "DUR"
	},
	{
		name: "London Borough of Ealing",
		key: "EAL"
	},
	{
		name: "East Ayrshire",
		key: "EAY"
	},
	{
		name: "City of Edinburgh",
		key: "EDH"
	},
	{
		name: "East Dunbartonshire",
		key: "EDU"
	},
	{
		name: "East Lothian",
		key: "ELN"
	},
	{
		name: "Eilean Siar",
		key: "ELS"
	},
	{
		name: "Enfield",
		key: "ENF"
	},
	{
		name: "East Renfrewshire",
		key: "ERW"
	},
	{
		name: "East Riding of Yorkshire",
		key: "ERY"
	},
	{
		name: "Essex",
		key: "ESS"
	},
	{
		name: "East Sussex",
		key: "ESX"
	},
	{
		name: "Falkirk",
		key: "FAL"
	},
	{
		name: "Fife",
		key: "FIF"
	},
	{
		name: "Flintshire",
		key: "FLN"
	},
	{
		name: "Fermanagh and Omagh",
		key: "FMO"
	},
	{
		name: "Gateshead",
		key: "GAT"
	},
	{
		name: "Glasgow City",
		key: "GLG"
	},
	{
		name: "Gloucestershire",
		key: "GLS"
	},
	{
		name: "Royal Borough of Greenwich",
		key: "GRE"
	},
	{
		name: "Gwynedd",
		key: "GWN"
	},
	{
		name: "Halton",
		key: "HAL"
	},
	{
		name: "Hampshire",
		key: "HAM"
	},
	{
		name: "London Borough of Havering",
		key: "HAV"
	},
	{
		name: "London Borough of Hackney",
		key: "HCK"
	},
	{
		name: "Herefordshire",
		key: "HEF"
	},
	{
		name: "London Borough of Hillingdon",
		key: "HIL"
	},
	{
		name: "Highland",
		key: "HLD"
	},
	{
		name: "London Borough of Hammersmith and Fulham",
		key: "HMF"
	},
	{
		name: "London Borough of Hounslow",
		key: "HNS"
	},
	{
		name: "Hartlepool",
		key: "HPL"
	},
	{
		name: "Hertfordshire",
		key: "HRT"
	},
	{
		name: "London Borough of Harrow",
		key: "HRW"
	},
	{
		name: "London Borough of Haringey",
		key: "HRY"
	},
	{
		name: "Isles of Scilly",
		key: "IOS"
	},
	{
		name: "Isle of Wight",
		key: "IOW"
	},
	{
		name: "London Borough of Islington",
		key: "ISL"
	},
	{
		name: "Inverclyde",
		key: "IVC"
	},
	{
		name: "Royal Borough of Kensington and Chelsea",
		key: "KEC"
	},
	{
		name: "Kent",
		key: "KEN"
	},
	{
		name: "Kingston upon Hull",
		key: "KHL"
	},
	{
		name: "Kirklees",
		key: "KIR"
	},
	{
		name: "Royal Borough of Kingston upon Thames",
		key: "KTT"
	},
	{
		name: "Knowsley",
		key: "KWL"
	},
	{
		name: "Lancashire",
		key: "LAN"
	},
	{
		name: "Lisburn and Castlereagh",
		key: "LBC"
	},
	{
		name: "London Borough of Lambeth",
		key: "LBH"
	},
	{
		name: "Leicester",
		key: "LCE"
	},
	{
		name: "Leeds",
		key: "LDS"
	},
	{
		name: "Leicestershire",
		key: "LEC"
	},
	{
		name: "London Borough of Lewisham",
		key: "LEW"
	},
	{
		name: "Lincolnshire",
		key: "LIN"
	},
	{
		name: "Liverpool",
		key: "LIV"
	},
	{
		name: "City of London",
		key: "LND"
	},
	{
		name: "Luton",
		key: "LUT"
	},
	{
		name: "Manchester",
		key: "MAN"
	},
	{
		name: "Middlesbrough",
		key: "MDB"
	},
	{
		name: "Medway",
		key: "MDW"
	},
	{
		name: "Mid and East Antrim",
		key: "MEA"
	},
	{
		name: "Milton Keynes",
		key: "MIK"
	},
	{
		name: "Midlothian",
		key: "MLN"
	},
	{
		name: "Monmouthshire",
		key: "MON"
	},
	{
		name: "London Borough of Merton",
		key: "MRT"
	},
	{
		name: "Moray",
		key: "MRY"
	},
	{
		name: "Merthyr Tydfil",
		key: "MTY"
	},
	{
		name: "Mid Ulster",
		key: "MUL"
	},
	{
		name: "North Ayrshire",
		key: "NAY"
	},
	{
		name: "Northumberland",
		key: "NBL"
	},
	{
		name: "North East Lincolnshire",
		key: "NEL"
	},
	{
		name: "Newcastle upon Tyne",
		key: "NET"
	},
	{
		name: "Norfolk",
		key: "NFK"
	},
	{
		name: "Nottingham",
		key: "NGM"
	},
	{
		name: "North Lanarkshire",
		key: "NLK"
	},
	{
		name: "North Lincolnshire",
		key: "NLN"
	},
	{
		name: "County Down",
		key: "NMD"
	},
	{
		name: "North Somerset",
		key: "NSM"
	},
	{
		name: "Northamptonshire",
		key: "NTH"
	},
	{
		name: "Neath Port Talbot",
		key: "NTL"
	},
	{
		name: "Nottinghamshire",
		key: "NTT"
	},
	{
		name: "North Tyneside",
		key: "NTY"
	},
	{
		name: "London Borough of Newham",
		key: "NWM"
	},
	{
		name: "Newport",
		key: "NWP"
	},
	{
		name: "North Yorkshire",
		key: "NYK"
	},
	{
		name: "Oldham",
		key: "OLD"
	},
	{
		name: "Orkney Islands",
		key: "ORK"
	},
	{
		name: "Oxfordshire",
		key: "OXF"
	},
	{
		name: "Pembrokeshire",
		key: "PEM"
	},
	{
		name: "Perth and Kinross",
		key: "PKN"
	},
	{
		name: "Plymouth",
		key: "PLY"
	},
	{
		name: "Poole",
		key: "POL"
	},
	{
		name: "Portsmouth",
		key: "POR"
	},
	{
		name: "Powys",
		key: "POW"
	},
	{
		name: "Peterborough",
		key: "PTE"
	},
	{
		name: "Redcar and Cleveland",
		key: "RCC"
	},
	{
		name: "Rochdale",
		key: "RCH"
	},
	{
		name: "Rhondda Cynon Taf",
		key: "RCT"
	},
	{
		name: "London Borough of Redbridge",
		key: "RDB"
	},
	{
		name: "Reading",
		key: "RDG"
	},
	{
		name: "Renfrewshire",
		key: "RFW"
	},
	{
		name: "London Borough of Richmond upon Thames",
		key: "RIC"
	},
	{
		name: "Rotherham",
		key: "ROT"
	},
	{
		name: "Rutland",
		key: "RUT"
	},
	{
		name: "Sandwell",
		key: "SAW"
	},
	{
		name: "South Ayrshire",
		key: "SAY"
	},
	{
		name: "Scottish Borders",
		key: "SCB"
	},
	{
		name: "Suffolk",
		key: "SFK"
	},
	{
		name: "Sefton",
		key: "SFT"
	},
	{
		name: "South Gloucestershire",
		key: "SGC"
	},
	{
		name: "Sheffield",
		key: "SHF"
	},
	{
		name: "St. Helens",
		key: "SHN"
	},
	{
		name: "Shropshire",
		key: "SHR"
	},
	{
		name: "Stockport",
		key: "SKP"
	},
	{
		name: "Salford",
		key: "SLF"
	},
	{
		name: "Slough",
		key: "SLG"
	},
	{
		name: "South Lanarkshire",
		key: "SLK"
	},
	{
		name: "Sunderland",
		key: "SND"
	},
	{
		name: "Solihull",
		key: "SOL"
	},
	{
		name: "Somerset",
		key: "SOM"
	},
	{
		name: "Southend-on-Sea",
		key: "SOS"
	},
	{
		name: "Surrey",
		key: "SRY"
	},
	{
		name: "Stoke-on-Trent",
		key: "STE"
	},
	{
		name: "Stirling",
		key: "STG"
	},
	{
		name: "Southampton",
		key: "STH"
	},
	{
		name: "London Borough of Sutton",
		key: "STN"
	},
	{
		name: "Staffordshire",
		key: "STS"
	},
	{
		name: "Stockton-on-Tees",
		key: "STT"
	},
	{
		name: "South Tyneside",
		key: "STY"
	},
	{
		name: "Swansea",
		key: "SWA"
	},
	{
		name: "Swindon",
		key: "SWD"
	},
	{
		name: "London Borough of Southwark",
		key: "SWK"
	},
	{
		name: "Tameside",
		key: "TAM"
	},
	{
		name: "Telford and Wrekin",
		key: "TFW"
	},
	{
		name: "Thurrock",
		key: "THR"
	},
	{
		name: "Torbay",
		key: "TOB"
	},
	{
		name: "Torfaen",
		key: "TOF"
	},
	{
		name: "Trafford",
		key: "TRF"
	},
	{
		name: "London Borough of Tower Hamlets",
		key: "TWH"
	},
	{
		name: "Vale of Glamorgan",
		key: "VGL"
	},
	{
		name: "Warwickshire",
		key: "WAR"
	},
	{
		name: "West Berkshire",
		key: "WBK"
	},
	{
		name: "West Dunbartonshire",
		key: "WDU"
	},
	{
		name: "London Borough of Waltham Forest",
		key: "WFT"
	},
	{
		name: "Wigan",
		key: "WGN"
	},
	{
		name: "Wiltshire",
		key: "WIL"
	},
	{
		name: "Wakefield",
		key: "WKF"
	},
	{
		name: "Walsall",
		key: "WLL"
	},
	{
		name: "West Lothian",
		key: "WLN"
	},
	{
		name: "Wolverhampton",
		key: "WLV"
	},
	{
		name: "London Borough of Wandsworth",
		key: "WND"
	},
	{
		name: "Windsor and Maidenhead",
		key: "WNM"
	},
	{
		name: "Wokingham",
		key: "WOK"
	},
	{
		name: "Worcestershire",
		key: "WOR"
	},
	{
		name: "Wirral",
		key: "WRL"
	},
	{
		name: "Warrington",
		key: "WRT"
	},
	{
		name: "Wrexham",
		key: "WRX"
	},
	{
		name: "Westminster",
		key: "WSM"
	},
	{
		name: "West Sussex",
		key: "WSX"
	},
	{
		name: "York",
		key: "YOR"
	},
	{
		name: "Shetland Islands",
		key: "ZET"
	}
];
var IE$2 = [
	{
		name: "County Clare",
		key: "CE"
	},
	{
		name: "County Cavan",
		key: "CN"
	},
	{
		name: "County Cork",
		key: "CO"
	},
	{
		name: "County Carlow",
		key: "CW"
	},
	{
		name: "County Dublin",
		key: "D"
	},
	{
		name: "County Donegal",
		key: "DL"
	},
	{
		name: "County Galway",
		key: "G"
	},
	{
		name: "County Kildare",
		key: "KE"
	},
	{
		name: "County Kilkenny",
		key: "KK"
	},
	{
		name: "County Kerry",
		key: "KY"
	},
	{
		name: "County Longford",
		key: "LD"
	},
	{
		name: "County Louth",
		key: "LH"
	},
	{
		name: "County Limerick",
		key: "LK"
	},
	{
		name: "County Leitrim",
		key: "LM"
	},
	{
		name: "County Laois",
		key: "LS"
	},
	{
		name: "County Meath",
		key: "MH"
	},
	{
		name: "County Monaghan",
		key: "MN"
	},
	{
		name: "County Mayo",
		key: "MO"
	},
	{
		name: "County Offaly",
		key: "OY"
	},
	{
		name: "County Roscommon",
		key: "RN"
	},
	{
		name: "County Sligo",
		key: "SO"
	},
	{
		name: "County Tipperary",
		key: "TA"
	},
	{
		name: "County Waterford",
		key: "WD"
	},
	{
		name: "County Westmeath",
		key: "WH"
	},
	{
		name: "County Wicklow",
		key: "WW"
	},
	{
		name: "County Wexford",
		key: "WX"
	}
];
var IT$3 = [
	{
		name: "Agrigento",
		key: "AG"
	},
	{
		name: "Alessandria",
		key: "AL"
	},
	{
		name: "Ancona",
		key: "AN"
	},
	{
		name: "Aosta",
		key: "AO"
	},
	{
		name: "Ascoli Piceno",
		key: "AP"
	},
	{
		name: "L'Aquila",
		key: "AQ"
	},
	{
		name: "Arezzo",
		key: "AR"
	},
	{
		name: "Asti",
		key: "AT"
	},
	{
		name: "Avellino",
		key: "AV"
	},
	{
		name: "Bari",
		key: "BA"
	},
	{
		name: "Bergamo",
		key: "BG"
	},
	{
		name: "Biella",
		key: "BI"
	},
	{
		name: "Belluno",
		key: "BL"
	},
	{
		name: "Benevento",
		key: "BN"
	},
	{
		name: "Bologna",
		key: "BO"
	},
	{
		name: "Brindisi",
		key: "BR"
	},
	{
		name: "Brescia",
		key: "BS"
	},
	{
		name: "Barletta-Andria-Trani",
		key: "BT"
	},
	{
		name: {
			"default": "Bolzano - Bozen",
			alt_de: "Südtirol",
			alt_en: "South Tyrol",
			alt_it: "Bolzano"
		},
		key: "BZ"
	},
	{
		name: "Cagliari",
		key: "CA"
	},
	{
		name: "Campobasso",
		key: "CB"
	},
	{
		name: "Caserta",
		key: "CE"
	},
	{
		name: "Chieti",
		key: "CH"
	},
	{
		name: "Caltanissetta",
		key: "CL"
	},
	{
		name: "Cuneo",
		key: "CN"
	},
	{
		name: "Como",
		key: "CO"
	},
	{
		name: "Cremona",
		key: "CR"
	},
	{
		name: "Cosenza",
		key: "CS"
	},
	{
		name: "Catania",
		key: "CT"
	},
	{
		name: "Catanzaro",
		key: "CZ"
	},
	{
		name: "Enna",
		key: "EN"
	},
	{
		name: "Forlì-Cesena",
		key: "FC"
	},
	{
		name: "Ferrara",
		key: "FE"
	},
	{
		name: "Foggia",
		key: "FG"
	},
	{
		name: {
			"default": "Firenze",
			alt_en: "Florence"
		},
		key: "FI"
	},
	{
		name: "Fermo",
		key: "FM"
	},
	{
		name: "Frosinone",
		key: "FR"
	},
	{
		name: "Genova",
		key: "GE"
	},
	{
		name: "Grosseto",
		key: "GR"
	},
	{
		name: "Imperia",
		key: "IM"
	},
	{
		name: "Isernia",
		key: "IS"
	},
	{
		name: "Crotone",
		key: "KR"
	},
	{
		name: "Lecco",
		key: "LC"
	},
	{
		name: "Lecce",
		key: "LE"
	},
	{
		name: "Livorno",
		key: "LI"
	},
	{
		name: "Lodi",
		key: "LO"
	},
	{
		name: "Latina",
		key: "LT"
	},
	{
		name: "Lucca",
		key: "LU"
	},
	{
		name: {
			"default": "Monza e della Brianza",
			alt_en: "Monza and Brianza"
		},
		key: "MB"
	},
	{
		name: "Macerata",
		key: "MC"
	},
	{
		name: "Messina",
		key: "ME"
	},
	{
		name: {
			"default": "Milano",
			alt_en: "Milan"
		},
		key: "MI"
	},
	{
		name: "Mantova",
		key: "MN"
	},
	{
		name: "Modena",
		key: "MO"
	},
	{
		name: "Massa-Carrara",
		key: "MS"
	},
	{
		name: "Matera",
		key: "MT"
	},
	{
		name: "Napoli",
		key: "NA"
	},
	{
		name: "Novara",
		key: "NO"
	},
	{
		name: "Nuoro",
		key: "NU"
	},
	{
		name: "Ogliastra",
		key: "OG"
	},
	{
		name: "Oristano",
		key: "OR"
	},
	{
		name: "Olbia-Tempio",
		key: "OT"
	},
	{
		name: "Palermo",
		key: "PA"
	},
	{
		name: "Piacenza",
		key: "PC"
	},
	{
		name: "Padova",
		key: "PD"
	},
	{
		name: "Pescara",
		key: "PE"
	},
	{
		name: "Perugia",
		key: "PG"
	},
	{
		name: "Pisa",
		key: "PI"
	},
	{
		name: "Prato",
		key: "PO"
	},
	{
		name: "Parma",
		key: "PR"
	},
	{
		name: "Pistoia",
		key: "PT"
	},
	{
		name: "Pesaro e Urbino",
		key: "PU"
	},
	{
		name: "Pavia",
		key: "PV"
	},
	{
		name: "Potenza",
		key: "PZ"
	},
	{
		name: "Ravenna",
		key: "RA"
	},
	{
		name: "Reggio Calabria",
		key: "RC"
	},
	{
		name: "Reggio Emilia",
		key: "RE"
	},
	{
		name: "Ragusa",
		key: "RG"
	},
	{
		name: "Rieti",
		key: "RI"
	},
	{
		name: {
			"default": "Roma Capitale",
			alt_en: "Rome"
		},
		key: "RM"
	},
	{
		name: "Rimini",
		key: "RN"
	},
	{
		name: "Rovigo",
		key: "RO"
	},
	{
		name: "Salerno",
		key: "SA"
	},
	{
		name: "Siena",
		key: "SI"
	},
	{
		name: "Sondrio",
		key: "SO"
	},
	{
		name: "La Spezia",
		key: "SP"
	},
	{
		name: "Siracusa",
		key: "SR"
	},
	{
		name: "Sassari",
		key: "SS"
	},
	{
		name: "Savona",
		key: "SV"
	},
	{
		name: "Taranto",
		key: "TA"
	},
	{
		name: "Teramo",
		key: "TE"
	},
	{
		name: "Trento",
		key: "TN"
	},
	{
		name: "Torino",
		key: "TO"
	},
	{
		name: "Trapani",
		key: "TP"
	},
	{
		name: "Terni",
		key: "TR"
	},
	{
		name: "Treviso",
		key: "TV"
	},
	{
		name: "Varese",
		key: "VA"
	},
	{
		name: "Verbano-Cusio-Ossola",
		key: "VB"
	},
	{
		name: "Vercelli",
		key: "VC"
	},
	{
		name: "Venezia",
		key: "VE"
	},
	{
		name: "Vicenza",
		key: "VI"
	},
	{
		name: "Verona",
		key: "VR"
	},
	{
		name: "Viterbo",
		key: "VT"
	},
	{
		name: "Vibo Valentia",
		key: "VV"
	}
];
var LU$2 = [
	{
		name: {
			"default": "Canton Capellen",
			alt_de: "Kanton Kapellen"
		},
		key: "CA"
	},
	{
		name: {
			"default": "Canton Clervaux",
			alt_de: "Kanton Clerf"
		},
		key: "CL"
	},
	{
		name: {
			"default": "Canton Diekirch",
			alt_de: "Kanton Diekirch"
		},
		key: "DI"
	},
	{
		name: {
			"default": "Canton Echternach",
			alt_de: "Kanton Echternach"
		},
		key: "EC"
	},
	{
		name: {
			"default": "Canton Esch-sur-Alzette",
			alt_de: "Kanton Esch an der Alzette"
		},
		key: "ES"
	},
	{
		name: {
			"default": "Canton Grevenmacher",
			alt_de: "Kanton Grevenmacher"
		},
		key: "GR"
	},
	{
		name: {
			"default": "Canton Luxembourg",
			alt_de: "Kanton Luxemburg"
		},
		key: "LU"
	},
	{
		name: {
			"default": "Canton Mersch",
			alt_de: "Kanton Mersch"
		},
		key: "ME"
	},
	{
		name: {
			"default": "Canton Redange",
			alt_de: "Kanton Redingen"
		},
		key: "RD"
	},
	{
		name: {
			"default": "Canton Remich",
			alt_de: "Kanton Remich"
		},
		key: "RM"
	},
	{
		name: {
			"default": "Canton Vianden",
			alt_de: "Kanton Vianden"
		},
		key: "VD"
	},
	{
		name: {
			"default": "Canton Wiltz",
			alt_de: "Kanton Wiltz"
		},
		key: "WI"
	}
];
var PT$3 = [
	{
		name: "Albufeira",
		key: "ABF"
	},
	{
		name: "Albergaria-a-Velha",
		key: "ABL"
	},
	{
		name: "Abrantes",
		key: "ABT"
	},
	{
		name: "Alcobaça",
		key: "ACB"
	},
	{
		name: "Alcochete",
		key: "ACH"
	},
	{
		name: "Alcanena",
		key: "ACN"
	},
	{
		name: "Alcoutim",
		key: "ACT"
	},
	{
		name: "Alandroal",
		key: "ADL"
	},
	{
		name: "Almodôvar",
		key: "ADV"
	},
	{
		name: "Alfândega da Fé",
		key: "AFE"
	},
	{
		name: "Aguiar da Beira",
		key: "AGB"
	},
	{
		name: "Águeda",
		key: "AGD"
	},
	{
		name: "Angra do Heroísmo",
		key: "AGH"
	},
	{
		name: "Arganil",
		key: "AGN"
	},
	{
		name: "Aljustrel",
		key: "AJT"
	},
	{
		name: "Aljezur",
		key: "AJZ"
	},
	{
		name: "Almeida",
		key: "ALD"
	},
	{
		name: "Alijó",
		key: "ALJ"
	},
	{
		name: "Almada",
		key: "ALM"
	},
	{
		name: "Alenquer",
		key: "ALQ"
	},
	{
		name: "Almeirim",
		key: "ALR"
	},
	{
		name: "Alter do Chão",
		key: "ALT"
	},
	{
		name: "Amadora",
		key: "AMD"
	},
	{
		name: "Armamar",
		key: "AMM"
	},
	{
		name: "Amares",
		key: "AMR"
	},
	{
		name: "Amarante",
		key: "AMT"
	},
	{
		name: "Anadia",
		key: "AND"
	},
	{
		name: "Ansião",
		key: "ANS"
	},
	{
		name: "Alpiarça",
		key: "APC"
	},
	{
		name: "Arouca",
		key: "ARC"
	},
	{
		name: "Arraiolos",
		key: "ARL"
	},
	{
		name: "Arronches",
		key: "ARR"
	},
	{
		name: "Arruda dos Vinhos",
		key: "ARV"
	},
	{
		name: "Alcácer do Sal",
		key: "ASL"
	},
	{
		name: "Aveiro",
		key: "AVR"
	},
	{
		name: "Avis",
		key: "AVS"
	},
	{
		name: "Alvito",
		key: "AVT"
	},
	{
		name: "Arcos de Valdevez",
		key: "AVV"
	},
	{
		name: "Alvaiázere",
		key: "AVZ"
	},
	{
		name: "Azambuja",
		key: "AZB"
	},
	{
		name: "Baião",
		key: "BAO"
	},
	{
		name: "Bombarral",
		key: "BBR"
	},
	{
		name: "Barcelos",
		key: "BCL"
	},
	{
		name: "Bragança",
		key: "BGC"
	},
	{
		name: "Beja",
		key: "BJA"
	},
	{
		name: "Belmonte",
		key: "BMT"
	},
	{
		name: "Benavente",
		key: "BNV"
	},
	{
		name: "Borba",
		key: "BRB"
	},
	{
		name: "Barrancos",
		key: "BRC"
	},
	{
		name: "Braga",
		key: "BRG"
	},
	{
		name: "Barreiro",
		key: "BRR"
	},
	{
		name: "Boticas",
		key: "BTC"
	},
	{
		name: "Batalha",
		key: "BTL"
	},
	{
		name: "Cabeceiras de Basto",
		key: "CBC"
	},
	{
		name: "Coimbra",
		key: "CBR"
	},
	{
		name: "Celorico de Basto",
		key: "CBT"
	},
	{
		name: "Coruche",
		key: "CCH"
	},
	{
		name: "Condeixa-a-Nova",
		key: "CDN"
	},
	{
		name: "Castro Daire",
		key: "CDR"
	},
	{
		name: "Cadaval",
		key: "CDV"
	},
	{
		name: "Chamusca",
		key: "CHM"
	},
	{
		name: "Calheta",
		key: "CHT"
	},
	{
		name: "Chaves",
		key: "CHV"
	},
	{
		name: "Celorico da Beira",
		key: "CLB"
	},
	{
		name: "Caldas da Rainha",
		key: "CLD"
	},
	{
		name: "Calheta",
		key: "CLT"
	},
	{
		name: "Câmara de Lobos",
		key: "CML"
	},
	{
		name: "Caminha",
		key: "CMN"
	},
	{
		name: "Campo Maior",
		key: "CMR"
	},
	{
		name: "Cinfães",
		key: "CNF"
	},
	{
		name: "Cantanhede",
		key: "CNT"
	},
	{
		name: "Castanheira de Pera",
		key: "CPR"
	},
	{
		name: "Castelo de Paiva",
		key: "CPV"
	},
	{
		name: "Carregal do Sal",
		key: "CRS"
	},
	{
		name: "Crato",
		key: "CRT"
	},
	{
		name: "Corvo",
		key: "CRV"
	},
	{
		name: "Carrazeda de Ansiães",
		key: "CRZ"
	},
	{
		name: "Cascais",
		key: "CSC"
	},
	{
		name: "Castelo Branco",
		key: "CTB"
	},
	{
		name: "Constância",
		key: "CTC"
	},
	{
		name: "Castro Marim",
		key: "CTM"
	},
	{
		name: "Cartaxo",
		key: "CTX"
	},
	{
		name: "Cuba",
		key: "CUB"
	},
	{
		name: "Castelo de Vide",
		key: "CVD"
	},
	{
		name: "Covilhã",
		key: "CVL"
	},
	{
		name: "Castro Verde",
		key: "CVR"
	},
	{
		name: "Elvas",
		key: "ELV"
	},
	{
		name: "Entroncamento",
		key: "ENT"
	},
	{
		name: "Esposende",
		key: "EPS"
	},
	{
		name: "Espinho",
		key: "ESP"
	},
	{
		name: "Estarreja",
		key: "ETR"
	},
	{
		name: "Estremoz",
		key: "ETZ"
	},
	{
		name: "Évora",
		key: "EVR"
	},
	{
		name: "Fafe",
		key: "FAF"
	},
	{
		name: "Fornos de Algodres",
		key: "FAG"
	},
	{
		name: "Ferreira do Alentejo",
		key: "FAL"
	},
	{
		name: "Faro",
		key: "FAR"
	},
	{
		name: "Figueira de Castelo Rodrigo",
		key: "FCR"
	},
	{
		name: "Freixo de Espada à Cinta",
		key: "FEC"
	},
	{
		name: "Figueira da Foz",
		key: "FIG"
	},
	{
		name: "Felgueiras",
		key: "FLG"
	},
	{
		name: "Fundão",
		key: "FND"
	},
	{
		name: "Fronteira",
		key: "FTR"
	},
	{
		name: "Funchal",
		key: "FUN"
	},
	{
		name: "Figueiró dos Vinhos",
		key: "FVN"
	},
	{
		name: "Ferreira do Zêzere",
		key: "FZZ"
	},
	{
		name: "Gavião",
		key: "GAV"
	},
	{
		name: "Grândola",
		key: "GDL"
	},
	{
		name: "Gondomar",
		key: "GDM"
	},
	{
		name: "Golegã",
		key: "GLG"
	},
	{
		name: "Guimarães",
		key: "GMR"
	},
	{
		name: "Góis",
		key: "GOI"
	},
	{
		name: "Guarda",
		key: "GRD"
	},
	{
		name: "Gouveia",
		key: "GVA"
	},
	{
		name: "Horta",
		key: "HRT"
	},
	{
		name: "Idanha-a-Nova",
		key: "IDN"
	},
	{
		name: "Ílhavo",
		key: "ILH"
	},
	{
		name: "Lagoa",
		key: "LAG"
	},
	{
		name: "Lagoa",
		key: "LGA"
	},
	{
		name: "Lajes das Flores",
		key: "LGF"
	},
	{
		name: "Lajes do Pico",
		key: "LGP"
	},
	{
		name: "Lagos",
		key: "LGS"
	},
	{
		name: "Loulé",
		key: "LLE"
	},
	{
		name: "Lamego",
		key: "LMG"
	},
	{
		name: "Lourinhã",
		key: "LNH"
	},
	{
		name: "Leiria",
		key: "LRA"
	},
	{
		name: "Loures",
		key: "LRS"
	},
	{
		name: "Lousã",
		key: "LSA"
	},
	{
		name: "Lisboa",
		key: "LSB"
	},
	{
		name: "Lousada",
		key: "LSD"
	},
	{
		name: "Mação",
		key: "MAC"
	},
	{
		name: "Madalena",
		key: "MAD"
	},
	{
		name: "Maia",
		key: "MAI"
	},
	{
		name: "Moimenta da Beira",
		key: "MBR"
	},
	{
		name: "Machico",
		key: "MCH"
	},
	{
		name: "Marco de Canaveses",
		key: "MCN"
	},
	{
		name: "Monchique",
		key: "MCQ"
	},
	{
		name: "Miranda do Corvo",
		key: "MCV"
	},
	{
		name: "Mêda",
		key: "MDA"
	},
	{
		name: "Mondim de Basto",
		key: "MDB"
	},
	{
		name: "Macedo de Cavaleiros",
		key: "MDC"
	},
	{
		name: "Mirandela",
		key: "MDL"
	},
	{
		name: "Miranda do Douro",
		key: "MDR"
	},
	{
		name: "Mafra",
		key: "MFR"
	},
	{
		name: "Monforte",
		key: "MFT"
	},
	{
		name: "Mogadouro",
		key: "MGD"
	},
	{
		name: "Mangualde",
		key: "MGL"
	},
	{
		name: "Marinha Grande",
		key: "MGR"
	},
	{
		name: "Mira",
		key: "MIR"
	},
	{
		name: "Mealhada",
		key: "MLD"
	},
	{
		name: "Melgaço",
		key: "MLG"
	},
	{
		name: "Montemor-o-Novo",
		key: "MMN"
	},
	{
		name: "Montemor-o-Velho",
		key: "MMV"
	},
	{
		name: "Monção",
		key: "MNC"
	},
	{
		name: "Mora",
		key: "MOR"
	},
	{
		name: "Mourão",
		key: "MOU"
	},
	{
		name: "Moura",
		key: "MRA"
	},
	{
		name: "Murtosa",
		key: "MRS"
	},
	{
		name: "Mortágua",
		key: "MRT"
	},
	{
		name: "Marvão",
		key: "MRV"
	},
	{
		name: "Mesão Frio",
		key: "MSF"
	},
	{
		name: "Moita",
		key: "MTA"
	},
	{
		name: "Manteigas",
		key: "MTG"
	},
	{
		name: "Montijo",
		key: "MTJ"
	},
	{
		name: "Mértola",
		key: "MTL"
	},
	{
		name: "Montalegre",
		key: "MTR"
	},
	{
		name: "Matosinhos",
		key: "MTS"
	},
	{
		name: "Murça",
		key: "MUR"
	},
	{
		name: "Nisa",
		key: "NIS"
	},
	{
		name: "Nelas",
		key: "NLS"
	},
	{
		name: "Nordeste",
		key: "NRD"
	},
	{
		name: "Nazaré",
		key: "NZR"
	},
	{
		name: "Oliveira de Azeméis",
		key: "OAZ"
	},
	{
		name: "Óbidos",
		key: "OBD"
	},
	{
		name: "Oliveira do Bairro",
		key: "OBR"
	},
	{
		name: "Odemira",
		key: "ODM"
	},
	{
		name: "Odivelas",
		key: "ODV"
	},
	{
		name: "Oeiras",
		key: "OER"
	},
	{
		name: "Oliveira de Frades",
		key: "OFR"
	},
	{
		name: "Oliveira do Hospital",
		key: "OHP"
	},
	{
		name: "Olhão",
		key: "OLH"
	},
	{
		name: "Oleiros",
		key: "OLR"
	},
	{
		name: "Ourique",
		key: "ORQ"
	},
	{
		name: "Ovar",
		key: "OVR"
	},
	{
		name: "Pombal",
		key: "PBL"
	},
	{
		name: "Paredes de Coura",
		key: "PCR"
	},
	{
		name: "Penalva do Castelo",
		key: "PCT"
	},
	{
		name: "Penacova",
		key: "PCV"
	},
	{
		name: "Ponta Delgada",
		key: "PDL"
	},
	{
		name: "Paços de Ferreira",
		key: "PFR"
	},
	{
		name: "Pedrógão Grande",
		key: "PGR"
	},
	{
		name: "Palmela",
		key: "PLM"
	},
	{
		name: "Porto de Mós",
		key: "PMS"
	},
	{
		name: "Porto Moniz",
		key: "PMZ"
	},
	{
		name: "Penamacor",
		key: "PNC"
	},
	{
		name: "Penedono",
		key: "PND"
	},
	{
		name: "Penafiel",
		key: "PNF"
	},
	{
		name: "Pinhel",
		key: "PNH"
	},
	{
		name: "Peniche",
		key: "PNI"
	},
	{
		name: "Penela",
		key: "PNL"
	},
	{
		name: "Proença-a-Nova",
		key: "PNV"
	},
	{
		name: "Pampilhosa da Serra",
		key: "PPS"
	},
	{
		name: "Paredes",
		key: "PRD"
	},
	{
		name: "Peso da Régua",
		key: "PRG"
	},
	{
		name: "Portel",
		key: "PRL"
	},
	{
		name: "Vila Nova de Poiares",
		key: "PRS"
	},
	{
		name: "Porto",
		key: "PRT"
	},
	{
		name: "Ponte de Sor",
		key: "PSR"
	},
	{
		name: "Porto Santo",
		key: "PST"
	},
	{
		name: "Ponte da Barca",
		key: "PTB"
	},
	{
		name: "Portalegre",
		key: "PTG"
	},
	{
		name: "Ponte de Lima",
		key: "PTL"
	},
	{
		name: "Portimão",
		key: "PTM"
	},
	{
		name: "Ponta do Sol",
		key: "PTS"
	},
	{
		name: "Povoação",
		key: "PVC"
	},
	{
		name: "Póvoa de Lanhoso",
		key: "PVL"
	},
	{
		name: "Póvoa de Varzim",
		key: "PVZ"
	},
	{
		name: "Ribeira Brava",
		key: "RBR"
	},
	{
		name: "Redondo",
		key: "RDD"
	},
	{
		name: "Ribeira Grande",
		key: "RGR"
	},
	{
		name: "Rio Maior",
		key: "RMR"
	},
	{
		name: "Reguengos de Monsaraz",
		key: "RMZ"
	},
	{
		name: "Ribeira de Pena",
		key: "RPN"
	},
	{
		name: "Resende",
		key: "RSD"
	},
	{
		name: "Sátão",
		key: "SAT"
	},
	{
		name: "São Brás de Alportel",
		key: "SBA"
	},
	{
		name: "Sabugal",
		key: "SBG"
	},
	{
		name: "Sabrosa",
		key: "SBR"
	},
	{
		name: "Santa Comba Dão",
		key: "SCD"
	},
	{
		name: "Santa Cruz das Flores",
		key: "SCF"
	},
	{
		name: "Santa Cruz da Graciosa",
		key: "SCG"
	},
	{
		name: "Santa Cruz",
		key: "SCR"
	},
	{
		name: "Seia",
		key: "SEI"
	},
	{
		name: "São João da Madeira",
		key: "SJM"
	},
	{
		name: "São João da Pesqueira",
		key: "SJP"
	},
	{
		name: "Silves",
		key: "SLV"
	},
	{
		name: "Sobral de Monte Agraço",
		key: "SMA"
	},
	{
		name: "Salvaterra de Magos",
		key: "SMG"
	},
	{
		name: "Santa Marta de Penaguião",
		key: "SMP"
	},
	{
		name: "Sines",
		key: "SNS"
	},
	{
		name: "Sintra",
		key: "SNT"
	},
	{
		name: "São Pedro do Sul",
		key: "SPS"
	},
	{
		name: "Sardoal",
		key: "SRD"
	},
	{
		name: "Soure",
		key: "SRE"
	},
	{
		name: "Sernancelhe",
		key: "SRN"
	},
	{
		name: "São Roque do Pico",
		key: "SRP"
	},
	{
		name: "Sertã",
		key: "SRT"
	},
	{
		name: "Sesimbra",
		key: "SSB"
	},
	{
		name: "Sousel",
		key: "SSL"
	},
	{
		name: "Setúbal",
		key: "STB"
	},
	{
		name: "Santiago do Cacém",
		key: "STC"
	},
	{
		name: "Santana",
		key: "STN"
	},
	{
		name: "Santarém",
		key: "STR"
	},
	{
		name: "Santo Tirso",
		key: "STS"
	},
	{
		name: "São Vicente",
		key: "SVC"
	},
	{
		name: "Sever do Vouga",
		key: "SVV"
	},
	{
		name: "Seixal",
		key: "SXL"
	},
	{
		name: "Tabuaço",
		key: "TBC"
	},
	{
		name: "Terras de Bouro",
		key: "TBR"
	},
	{
		name: "Tábua",
		key: "TBU"
	},
	{
		name: "Trancoso",
		key: "TCS"
	},
	{
		name: "Torre de Moncorvo",
		key: "TMC"
	},
	{
		name: "Tomar",
		key: "TMR"
	},
	{
		name: "Tondela",
		key: "TND"
	},
	{
		name: "Torres Novas",
		key: "TNV"
	},
	{
		name: "Tarouca",
		key: "TRC"
	},
	{
		name: "Trofa",
		key: "TRF"
	},
	{
		name: "Torres Vedras",
		key: "TVD"
	},
	{
		name: "Tavira",
		key: "TVR"
	},
	{
		name: "Vila do Bispo",
		key: "VBP"
	},
	{
		name: "Vila do Conde",
		key: "VCD"
	},
	{
		name: "Viana do Castelo",
		key: "VCT"
	},
	{
		name: "Vidigueira",
		key: "VDG"
	},
	{
		name: "Vila Franca do Campo",
		key: "VFC"
	},
	{
		name: "Vila Flor",
		key: "VFL"
	},
	{
		name: "Santa Maria da Feira",
		key: "VFR"
	},
	{
		name: "Vila Franca de Xira",
		key: "VFX"
	},
	{
		name: "Vagos",
		key: "VGS"
	},
	{
		name: "Viseu",
		key: "VIS"
	},
	{
		name: "Vizela",
		key: "VIZ"
	},
	{
		name: "Vale de Cambra",
		key: "VLC"
	},
	{
		name: "Vila Nova de Foz Coa",
		key: "VLF"
	},
	{
		name: "Valongo",
		key: "VLG"
	},
	{
		name: "Valença",
		key: "VLN"
	},
	{
		name: "Valpaços",
		key: "VLP"
	},
	{
		name: "Vila de Rei",
		key: "VLR"
	},
	{
		name: "Velas",
		key: "VLS"
	},
	{
		name: "Vimioso",
		key: "VMS"
	},
	{
		name: "Vila Nova da Barquinha",
		key: "VNB"
	},
	{
		name: "Vila Nova de Cerveira",
		key: "VNC"
	},
	{
		name: "Vendas Novas",
		key: "VND"
	},
	{
		name: "Vila Nova de Famalicão",
		key: "VNF"
	},
	{
		name: "Vila Nova de Gaia",
		key: "VNG"
	},
	{
		name: "Vinhais",
		key: "VNH"
	},
	{
		name: "Ourém",
		key: "VNO"
	},
	{
		name: "Vila Nova de Paiva",
		key: "VNP"
	},
	{
		name: "Viana do Alentejo",
		key: "VNT"
	},
	{
		name: "Vila Pouca de Aguiar",
		key: "VPA"
	},
	{
		name: "Vila do Porto",
		key: "VPT"
	},
	{
		name: "Praia da Vitória",
		key: "VPV"
	},
	{
		name: "Vila Real",
		key: "VRL"
	},
	{
		name: "Vieira do Minho",
		key: "VRM"
	},
	{
		name: "Vila Real de Santo António",
		key: "VRS"
	},
	{
		name: "Vila Viçosa",
		key: "VVC"
	},
	{
		name: "Vila Verde",
		key: "VVD"
	},
	{
		name: "Vila Velha de Ródão",
		key: "VVR"
	},
	{
		name: "Vouzela",
		key: "VZL"
	}
];
var countyCodes = {
	ES: ES$3,
	GB: GB$2,
	IE: IE$2,
	IT: IT$3,
	LU: LU$2,
	PT: PT$3
};

var AD$1 = [
	"CA"
];
var AE$1 = [
	"AR",
	"EN"
];
var AF$1 = [
	"FA",
	"PS"
];
var AG$1 = [
	"EN"
];
var AI$1 = [
	"EN"
];
var AL$1 = [
	"SQ"
];
var AM$1 = [
	"HY"
];
var AO$1 = [
	"PT"
];
var AQ$1 = [
	"EN"
];
var AR$1 = [
	"ES"
];
var AS$1 = [
	"EN"
];
var AT$1 = [
	"DE"
];
var AU$1 = [
	"EN"
];
var AW$1 = [
	"NL"
];
var AX$1 = [
	"FI",
	"SV"
];
var AZ$1 = [
	"AZ"
];
var BA$1 = [
	"BS",
	"HR",
	"SR"
];
var BB$1 = [
	"EN"
];
var BD$1 = [
	"BN"
];
var BE$1 = [
	"FR",
	"NL",
	"DE"
];
var BF$1 = [
	"FR"
];
var BG$1 = [
	"BG"
];
var BH$1 = [
	"AR",
	"EN"
];
var BI$1 = [
	"EN",
	"FR"
];
var BJ$1 = [
	"FR"
];
var BL$1 = [
	"FR"
];
var BM$1 = [
	"EN"
];
var BN$1 = [
	"EN",
	"MS"
];
var BO$1 = [
	"ES"
];
var BQ$1 = [
	"NL",
	"EN"
];
var BR$1 = [
	"PT"
];
var BS$1 = [
	"EN"
];
var BT$1 = [
	"DZ"
];
var BV$1 = [
	"NO"
];
var BW$1 = [
	"EN"
];
var BY$1 = [
	"BY",
	"RU"
];
var BZ$1 = [
	"EN",
	"ES"
];
var CA$2 = [
	"EN",
	"FR"
];
var CC$1 = [
	"EN"
];
var CD$1 = [
	"FR"
];
var CF$1 = [
	"FR"
];
var CG$1 = [
	"FR"
];
var CH$1 = [
	"DE",
	"FR",
	"IT"
];
var CI$1 = [
	"FR"
];
var CK$1 = [
	"EN"
];
var CL$1 = [
	"ES"
];
var CM$1 = [
	"EN",
	"FR"
];
var CN$1 = [
	"ZH"
];
var CO$1 = [
	"ES"
];
var CR$1 = [
	"ES"
];
var CU$1 = [
	"ES"
];
var CV$1 = [
	"PT"
];
var CW$1 = [
	"EN",
	"NL"
];
var CX$1 = [
	"EN"
];
var CY$1 = [
	"EL"
];
var CZ$1 = [
	"CS"
];
var DE$2 = [
	"DE"
];
var DJ$1 = [
	"AR",
	"FR"
];
var DK$1 = [
	"DA"
];
var DM$1 = [
	"EN"
];
var DO$1 = [
	"ES"
];
var DZ$1 = [
	"AR",
	"FR"
];
var EC$1 = [
	"ES"
];
var EE$1 = [
	"ET"
];
var EG$1 = [
	"AR"
];
var EH$1 = [
	"AR",
	"ES",
	"FR"
];
var ER$1 = [
	"AR",
	"EN",
	"TI"
];
var ES$2 = [
	"CA",
	"ES",
	"EU",
	"GL"
];
var ET$2 = [
	"AM",
	"OM"
];
var FI$2 = [
	"FI",
	"SV"
];
var FJ$1 = [
	"EN"
];
var FK$1 = [
	"EN"
];
var FM$1 = [
	"EN"
];
var FO$1 = [
	"FO",
	"DA"
];
var FR$2 = [
	"FR"
];
var GA$1 = [
	"FR"
];
var GB$1 = [
	"EN"
];
var GD$1 = [
	"EN"
];
var GE$1 = [
	"KA"
];
var GF$1 = [
	"FR"
];
var GG$1 = [
	"EN"
];
var GH$1 = [
	"EN"
];
var GI$1 = [
	"EN"
];
var GL$2 = [
	"DA",
	"KL"
];
var GM$1 = [
	"EN"
];
var GN$1 = [
	"FR"
];
var GP$1 = [
	"FR"
];
var GQ$1 = [
	"ES",
	"FR",
	"PT"
];
var GR$1 = [
	"EL"
];
var GS$1 = [
	"EN"
];
var GT$1 = [
	"ES"
];
var GU$1 = [
	"EN"
];
var GW$1 = [
	"PT"
];
var GY$1 = [
	"EN"
];
var HK$1 = [
	"EN",
	"ZH"
];
var HM$1 = [
	"EN"
];
var HN$1 = [
	"ES"
];
var HR$1 = [
	"HR"
];
var HT$1 = [
	"FR",
	"HT"
];
var HU$2 = [
	"HU"
];
var ID$1 = [
	"ID"
];
var IE$1 = [
	"EN"
];
var IL$1 = [
	"AR",
	"EN",
	"HE"
];
var IM$1 = [
	"EN"
];
var IN$1 = [
	"EN",
	"HI"
];
var IO$1 = [
	"EN"
];
var IQ$1 = [
	"AR"
];
var IR$1 = [
	"FA"
];
var IS$1 = [
	"IS"
];
var IT$2 = [
	"IT",
	"DE"
];
var JE$1 = [
	"EN"
];
var JM$1 = [
	"EN"
];
var JO$1 = [
	"AR"
];
var JP$1 = [
	"JP"
];
var KE$1 = [
	"EN",
	"SW"
];
var KG$1 = [
	"KY",
	"RU"
];
var KH$1 = [
	"KM"
];
var KI$1 = [
	"EN"
];
var KM$1 = [
	"AR",
	"FR",
	"SW"
];
var KN$1 = [
	"EN"
];
var KP$1 = [
	"KO"
];
var KR$1 = [
	"KO"
];
var KW$1 = [
	"AR"
];
var KY$1 = [
	"EN"
];
var KZ$1 = [
	"KK",
	"RU"
];
var LA$1 = [
	"LO"
];
var LB$1 = [
	"AR",
	"FR"
];
var LC$1 = [
	"EN"
];
var LI$1 = [
	"DE"
];
var LK$1 = [
	"EN",
	"SI",
	"TA"
];
var LR$1 = [
	"EN"
];
var LS$1 = [
	"EN",
	"ST"
];
var LT$1 = [
	"LT"
];
var LU$1 = [
	"DE",
	"FR"
];
var LV$1 = [
	"LV"
];
var LY$1 = [
	"AR"
];
var MA$1 = [
	"AR",
	"FR"
];
var MC$1 = [
	"FR"
];
var MD$1 = [
	"RO",
	"RU",
	"UK"
];
var ME$1 = [
	"SR"
];
var MF$1 = [
	"FR"
];
var MG$1 = [
	"FR",
	"MG"
];
var MH$1 = [
	"EN"
];
var MK$1 = [
	"MK"
];
var ML$1 = [
	"FR"
];
var MM$1 = [
	"MY"
];
var MN$1 = [
	"MN"
];
var MO$1 = [
	"PT",
	"ZH"
];
var MP$1 = [
	"EN"
];
var MQ$1 = [
	"FR"
];
var MR$1 = [
	"AR",
	"FR"
];
var MS$1 = [
	"EN"
];
var MT$1 = [
	"EN",
	"MT"
];
var MU$1 = [
	"EN",
	"FR"
];
var MV$1 = [
	"DV"
];
var MW$1 = [
	"EN",
	"NY"
];
var MX$1 = [
	"ES"
];
var MY$1 = [
	"MS"
];
var MZ$1 = [
	"PT"
];
var NA$1 = [
	"DE",
	"EN"
];
var NC$1 = [
	"FR"
];
var NE$1 = [
	"FR"
];
var NF$1 = [
	"EN"
];
var NG$1 = [
	"EN"
];
var NI$1 = [
	"ES"
];
var NL$2 = [
	"NL"
];
var NO$2 = [
	"NO"
];
var NP$1 = [
	"EN",
	"NE"
];
var NR$1 = [
	"EN"
];
var NU$1 = [
	"EN"
];
var NZ$1 = [
	"EN",
	"MI"
];
var OM$1 = [
	"AR",
	"EN"
];
var PA$1 = [
	"ES"
];
var PE$1 = [
	"ES"
];
var PF$1 = [
	"FR"
];
var PG$1 = [
	"EN"
];
var PH$1 = [
	"EN",
	"TL"
];
var PK$1 = [
	"EN",
	"UR"
];
var PL$2 = [
	"PL"
];
var PM$1 = [
	"FR"
];
var PN$1 = [
	"EN"
];
var PR$1 = [
	"EN",
	"ES"
];
var PS$1 = [
	"AR",
	"HE"
];
var PT$2 = [
	"PT"
];
var PW$1 = [
	"EN"
];
var PY$1 = [
	"ES"
];
var QA$1 = [
	"AR",
	"EN"
];
var RE$1 = [
	"FR"
];
var RO$2 = [
	"RO"
];
var RS$1 = [
	"SR"
];
var RU$2 = [
	"RU"
];
var RW$1 = [
	"EN",
	"FR",
	"RW"
];
var SA$1 = [
	"AR"
];
var SB$1 = [
	"EN"
];
var SC$1 = [
	"EN",
	"FR"
];
var SD$1 = [
	"AR",
	"EN"
];
var SE$1 = [
	"SV"
];
var SG$1 = [
	"EN",
	"ZH"
];
var SH$1 = [
	"EN"
];
var SI$1 = [
	"SL"
];
var SJ$1 = [
	"NO"
];
var SK$2 = [
	"SK"
];
var SL$2 = [
	"EN"
];
var SM$1 = [
	"IT"
];
var SN$1 = [
	"FR"
];
var SO$1 = [
	"AR",
	"SO"
];
var SR$1 = [
	"NL"
];
var SS$1 = [
	"EN"
];
var ST$1 = [
	"PT"
];
var SV$2 = [
	"ES"
];
var SX$1 = [
	"EN",
	"NL"
];
var SY$1 = [
	"AR"
];
var SZ$1 = [
	"EN",
	"SS"
];
var TC$1 = [
	"EN"
];
var TD$1 = [
	"AR",
	"FR"
];
var TF$1 = [
	"FR"
];
var TG$1 = [
	"FR"
];
var TH$1 = [
	"TH"
];
var TJ$1 = [
	"RU",
	"TG"
];
var TK$1 = [
	"EN"
];
var TL$1 = [
	"EN",
	"ID",
	"PT"
];
var TN$1 = [
	"AR",
	"FR"
];
var TM$1 = [
	"RU",
	"TK"
];
var TO$1 = [
	"EN",
	"TO"
];
var TR$2 = [
	"TR"
];
var TT$1 = [
	"EN"
];
var TV$1 = [
	"EN"
];
var TW$1 = [
	"ZH"
];
var TZ$1 = [
	"EN",
	"SW"
];
var UA$1 = [
	"UK"
];
var UG$1 = [
	"EN",
	"SW"
];
var UM$1 = [
	"EN"
];
var US$1 = [
	"EN"
];
var UY$1 = [
	"ES"
];
var UZ$1 = [
	"UZ"
];
var VA$1 = [
	"IT"
];
var VC$1 = [
	"EN"
];
var VE$1 = [
	"ES"
];
var VG$1 = [
	"EN"
];
var VI$2 = [
	"EN"
];
var VN$1 = [
	"VI"
];
var VU$1 = [
	"EN",
	"FR"
];
var WF$1 = [
	"FR"
];
var WS$1 = [
	"EN"
];
var XK$1 = [
	"SQ",
	"SR"
];
var YE$1 = [
	"AR"
];
var YT$1 = [
	"FR"
];
var ZA$1 = [
	"EN",
	"AF"
];
var ZM$1 = [
	"EN"
];
var ZW$1 = [
	"EN"
];
var country2lang = {
	AD: AD$1,
	AE: AE$1,
	AF: AF$1,
	AG: AG$1,
	AI: AI$1,
	AL: AL$1,
	AM: AM$1,
	AO: AO$1,
	AQ: AQ$1,
	AR: AR$1,
	AS: AS$1,
	AT: AT$1,
	AU: AU$1,
	AW: AW$1,
	AX: AX$1,
	AZ: AZ$1,
	BA: BA$1,
	BB: BB$1,
	BD: BD$1,
	BE: BE$1,
	BF: BF$1,
	BG: BG$1,
	BH: BH$1,
	BI: BI$1,
	BJ: BJ$1,
	BL: BL$1,
	BM: BM$1,
	BN: BN$1,
	BO: BO$1,
	BQ: BQ$1,
	BR: BR$1,
	BS: BS$1,
	BT: BT$1,
	BV: BV$1,
	BW: BW$1,
	BY: BY$1,
	BZ: BZ$1,
	CA: CA$2,
	CC: CC$1,
	CD: CD$1,
	CF: CF$1,
	CG: CG$1,
	CH: CH$1,
	CI: CI$1,
	CK: CK$1,
	CL: CL$1,
	CM: CM$1,
	CN: CN$1,
	CO: CO$1,
	CR: CR$1,
	CU: CU$1,
	CV: CV$1,
	CW: CW$1,
	CX: CX$1,
	CY: CY$1,
	CZ: CZ$1,
	DE: DE$2,
	DJ: DJ$1,
	DK: DK$1,
	DM: DM$1,
	DO: DO$1,
	DZ: DZ$1,
	EC: EC$1,
	EE: EE$1,
	EG: EG$1,
	EH: EH$1,
	ER: ER$1,
	ES: ES$2,
	ET: ET$2,
	FI: FI$2,
	FJ: FJ$1,
	FK: FK$1,
	FM: FM$1,
	FO: FO$1,
	FR: FR$2,
	GA: GA$1,
	GB: GB$1,
	GD: GD$1,
	GE: GE$1,
	GF: GF$1,
	GG: GG$1,
	GH: GH$1,
	GI: GI$1,
	GL: GL$2,
	GM: GM$1,
	GN: GN$1,
	GP: GP$1,
	GQ: GQ$1,
	GR: GR$1,
	GS: GS$1,
	GT: GT$1,
	GU: GU$1,
	GW: GW$1,
	GY: GY$1,
	HK: HK$1,
	HM: HM$1,
	HN: HN$1,
	HR: HR$1,
	HT: HT$1,
	HU: HU$2,
	ID: ID$1,
	IE: IE$1,
	IL: IL$1,
	IM: IM$1,
	IN: IN$1,
	IO: IO$1,
	IQ: IQ$1,
	IR: IR$1,
	IS: IS$1,
	IT: IT$2,
	JE: JE$1,
	JM: JM$1,
	JO: JO$1,
	JP: JP$1,
	KE: KE$1,
	KG: KG$1,
	KH: KH$1,
	KI: KI$1,
	KM: KM$1,
	KN: KN$1,
	KP: KP$1,
	KR: KR$1,
	KW: KW$1,
	KY: KY$1,
	KZ: KZ$1,
	LA: LA$1,
	LB: LB$1,
	LC: LC$1,
	LI: LI$1,
	LK: LK$1,
	LR: LR$1,
	LS: LS$1,
	LT: LT$1,
	LU: LU$1,
	LV: LV$1,
	LY: LY$1,
	MA: MA$1,
	MC: MC$1,
	MD: MD$1,
	ME: ME$1,
	MF: MF$1,
	MG: MG$1,
	MH: MH$1,
	MK: MK$1,
	ML: ML$1,
	MM: MM$1,
	MN: MN$1,
	MO: MO$1,
	MP: MP$1,
	MQ: MQ$1,
	MR: MR$1,
	MS: MS$1,
	MT: MT$1,
	MU: MU$1,
	MV: MV$1,
	MW: MW$1,
	MX: MX$1,
	MY: MY$1,
	MZ: MZ$1,
	NA: NA$1,
	NC: NC$1,
	NE: NE$1,
	NF: NF$1,
	NG: NG$1,
	NI: NI$1,
	NL: NL$2,
	NO: NO$2,
	NP: NP$1,
	NR: NR$1,
	NU: NU$1,
	NZ: NZ$1,
	OM: OM$1,
	PA: PA$1,
	PE: PE$1,
	PF: PF$1,
	PG: PG$1,
	PH: PH$1,
	PK: PK$1,
	PL: PL$2,
	PM: PM$1,
	PN: PN$1,
	PR: PR$1,
	PS: PS$1,
	PT: PT$2,
	PW: PW$1,
	PY: PY$1,
	QA: QA$1,
	RE: RE$1,
	RO: RO$2,
	RS: RS$1,
	RU: RU$2,
	RW: RW$1,
	SA: SA$1,
	SB: SB$1,
	SC: SC$1,
	SD: SD$1,
	SE: SE$1,
	SG: SG$1,
	SH: SH$1,
	SI: SI$1,
	SJ: SJ$1,
	SK: SK$2,
	SL: SL$2,
	SM: SM$1,
	SN: SN$1,
	SO: SO$1,
	SR: SR$1,
	SS: SS$1,
	ST: ST$1,
	SV: SV$2,
	SX: SX$1,
	SY: SY$1,
	SZ: SZ$1,
	TC: TC$1,
	TD: TD$1,
	TF: TF$1,
	TG: TG$1,
	TH: TH$1,
	TJ: TJ$1,
	TK: TK$1,
	TL: TL$1,
	TN: TN$1,
	TM: TM$1,
	TO: TO$1,
	TR: TR$2,
	TT: TT$1,
	TV: TV$1,
	TW: TW$1,
	TZ: TZ$1,
	UA: UA$1,
	UG: UG$1,
	UM: UM$1,
	US: US$1,
	UY: UY$1,
	UZ: UZ$1,
	VA: VA$1,
	VC: VC$1,
	VE: VE$1,
	VG: VG$1,
	VI: VI$2,
	VN: VN$1,
	VU: VU$1,
	WF: WF$1,
	WS: WS$1,
	XK: XK$1,
	YE: YE$1,
	YT: YT$1,
	ZA: ZA$1,
	ZM: ZM$1,
	ZW: ZW$1
};

var CA$1 = [
	{
		component: "road",
		replacements: [
			{
				src: "Autopista",
				dest: "Auto"
			},
			{
				src: "Avinguda",
				dest: "Av"
			},
			{
				src: "Baixada",
				dest: "Bda"
			},
			{
				src: "Baixos",
				dest: "Bxs"
			},
			{
				src: "Carretera",
				dest: "Ctra"
			},
			{
				src: "Carrer de",
				dest: "C"
			},
			{
				src: "Monestir",
				dest: "Mtir"
			},
			{
				src: "Parada",
				dest: "Par"
			},
			{
				src: "Passatge",
				dest: "Ptge"
			},
			{
				src: "Passeig",
				dest: "Pg"
			},
			{
				src: "Plaça",
				dest: "Pl"
			},
			{
				src: "Porta",
				dest: "Pta"
			},
			{
				src: "Rambla",
				dest: "Rbla"
			},
			{
				src: "Sagrada",
				dest: "Sgda"
			},
			{
				src: "Sagrat",
				dest: "Sgt"
			},
			{
				src: "Sant",
				dest: "St"
			},
			{
				src: "Santa",
				dest: "Sta"
			},
			{
				src: "Travessera",
				dest: "Trav"
			},
			{
				src: "Travessia",
				dest: "Trv"
			},
			{
				src: "via",
				dest: "v"
			}
		]
	}
];
var CS = [
	{
		component: "road",
		replacements: [
			{
				src: "Ulice",
				dest: "Ul"
			},
			{
				src: "Třída",
				dest: "Tř"
			},
			{
				src: "Náměstí",
				dest: "Nám"
			}
		]
	}
];
var DA = [
	{
		component: "road",
		replacements: [
			{
				src: "Gamle",
				dest: "Gl"
			},
			{
				src: "Gammel",
				dest: "Gl"
			},
			{
				src: "Lille",
				dest: "Ll"
			},
			{
				src: "Nordre",
				dest: "Ndr"
			},
			{
				src: "Nørre",
				dest: "Nr"
			},
			{
				src: "Sankt",
				dest: "Skt"
			},
			{
				src: "Store",
				dest: "St"
			},
			{
				src: "Søndre",
				dest: "Sdr"
			},
			{
				src: "Sønder",
				dest: "Sdr"
			},
			{
				src: "Vester",
				dest: "V"
			},
			{
				src: "Vestre",
				dest: "V"
			},
			{
				src: "Øster",
				dest: "Ø"
			},
			{
				src: "Østre",
				dest: "Ø"
			}
		]
	}
];
var DE$1 = [
	{
		component: "road",
		replacements: [
			{
				src: "Platz",
				dest: "Pl"
			},
			{
				src: "Sankt",
				dest: "St"
			},
			{
				src: "Straße",
				dest: "Str"
			},
			{
				src: "Strasse",
				dest: "Str"
			}
		]
	}
];
var EN = [
	{
		component: "country",
		replacements: [
			{
				src: "Central African Republic",
				dest: "CAR"
			},
			{
				src: "Democratic Republic of Congo",
				dest: "DRC"
			},
			{
				src: "New Zealand",
				dest: "NZ"
			},
			{
				src: "United Arab Emitrates",
				dest: "UAE"
			},
			{
				src: "United Kingdom",
				dest: "UK"
			},
			{
				src: "United States of America",
				dest: "USA"
			},
			{
				src: "United States Virgin Islands",
				dest: "USVI"
			}
		]
	},
	{
		component: "road",
		replacements: [
			{
				src: "Alley",
				dest: "Aly"
			},
			{
				src: "Arcade",
				dest: "Arc"
			},
			{
				src: "Avenue",
				dest: "Ave"
			},
			{
				src: "Boulevard",
				dest: "Blvd"
			},
			{
				src: "Circle",
				dest: "Cl"
			},
			{
				src: "Court",
				dest: "Ct"
			},
			{
				src: "Crescent",
				dest: "Cres"
			},
			{
				src: "Crossroad",
				dest: "XRD"
			},
			{
				src: "Drive",
				dest: "Dr"
			},
			{
				src: "Esplanade",
				dest: "Esp"
			},
			{
				src: "Expressway",
				dest: "EXPY"
			},
			{
				src: "Extention",
				dest: "Ext"
			},
			{
				src: "Freeway",
				dest: "Fwy"
			},
			{
				src: "Grove",
				dest: "Gr"
			},
			{
				src: "Highway",
				dest: "HWY"
			},
			{
				src: "Mountain",
				dest: "Mtn"
			},
			{
				src: "Northeast",
				dest: "NE"
			},
			{
				src: "Northwest",
				dest: "NW"
			},
			{
				src: "Place",
				dest: "Pl"
			},
			{
				src: "Road",
				dest: "Rd"
			},
			{
				src: "Southeast",
				dest: "SE"
			},
			{
				src: "Southwest",
				dest: "SW"
			},
			{
				src: "Square",
				dest: "Sq"
			},
			{
				src: "Street",
				dest: "St"
			},
			{
				src: "Terrace",
				dest: "Tce"
			},
			{
				src: "Throughway",
				dest: "TRWY"
			}
		]
	}
];
var ES$1 = [
	{
		component: "road",
		replacements: [
			{
				src: "Alameda",
				dest: "Alam"
			},
			{
				src: "Arboleda",
				dest: "Arb"
			},
			{
				src: "Arroyo",
				dest: "Arry"
			},
			{
				src: "Avenida",
				dest: "Avda"
			},
			{
				src: "Bloque",
				dest: "Blq"
			},
			{
				src: "Calle de",
				dest: "C"
			},
			{
				src: "Camino",
				dest: "Cno"
			},
			{
				src: "Carrera",
				dest: "Cra"
			},
			{
				src: "Carrero",
				dest: "Cro"
			},
			{
				src: "Cinturón",
				dest: "Cint"
			},
			{
				src: "Colonia",
				dest: "Col"
			},
			{
				src: "Diagonal",
				dest: "Diag"
			},
			{
				src: "Doctor",
				dest: "Dr"
			},
			{
				src: "Doctora",
				dest: "Dra"
			},
			{
				src: "Estación",
				dest: "Estcn"
			},
			{
				src: "Gran Vía",
				dest: "GV"
			},
			{
				src: "Jardín",
				dest: "Jdín"
			},
			{
				src: "Malecón",
				dest: "Malec"
			},
			{
				src: "Mercado",
				dest: "Merc"
			},
			{
				src: "Mirador",
				dest: "Mrdor"
			},
			{
				src: "Nuestra Señora",
				dest: "Ntra Sra"
			},
			{
				src: "Palacio",
				dest: "Pala"
			},
			{
				src: "Parque",
				dest: "Pque"
			},
			{
				src: "Pasadizo",
				dest: "Pzo"
			},
			{
				src: "Pasaje",
				dest: "Psje"
			},
			{
				src: "Paseo",
				dest: "Po"
			},
			{
				src: "Plaza",
				dest: "Pl"
			},
			{
				src: "Pueblo",
				dest: "Pblo"
			},
			{
				src: "Puente",
				dest: "Pnte"
			},
			{
				src: "Puerta",
				dest: "Pta"
			},
			{
				src: "Puerto",
				dest: "Pto"
			},
			{
				src: "Rambla",
				dest: "Rbla"
			},
			{
				src: "Ronda",
				dest: "Rda"
			},
			{
				src: "Rotonda",
				dest: "Rtda"
			},
			{
				src: "San",
				dest: "S"
			},
			{
				src: "Santa",
				dest: "Sta"
			},
			{
				src: "Santo",
				dest: "Sto"
			},
			{
				src: "Santas",
				dest: "Stas"
			},
			{
				src: "Santos",
				dest: "Stos"
			},
			{
				src: "Sector",
				dest: "Sect"
			},
			{
				src: "Viaducto",
				dest: "Vcto"
			}
		]
	}
];
var ET$1 = [
	{
		component: "road",
		replacements: [
			{
				src: "Maantee",
				dest: "mnt"
			},
			{
				src: "Puiestee",
				dest: "pst"
			},
			{
				src: "Raudtee",
				dest: "rdt"
			},
			{
				src: "Raudteejaam",
				dest: "rdtj"
			},
			{
				src: "Tänav",
				dest: "tn"
			}
		]
	}
];
var EU = [
	{
		component: "road",
		replacements: [
			{
				src: "Kalea",
				dest: "K"
			},
			{
				src: "Errepidea",
				dest: "Err"
			},
			{
				src: "Etorbidea",
				dest: "Etorb"
			}
		]
	}
];
var FI$1 = [
	{
		component: "road",
		replacements: [
			{
				src: "alue",
				dest: "al"
			},
			{
				src: "asema",
				dest: "as"
			},
			{
				src: "aukio",
				dest: "auk"
			},
			{
				src: "kaari",
				dest: "kri"
			},
			{
				src: "katu",
				dest: "k"
			},
			{
				src: "kuja",
				dest: "kj"
			},
			{
				src: "penger",
				dest: "pgr"
			},
			{
				src: "polku",
				dest: "p"
			},
			{
				src: "raitti",
				dest: "r"
			},
			{
				src: "ranta",
				dest: "rt"
			},
			{
				src: "rinne",
				dest: "rn"
			},
			{
				src: "tie",
				dest: "t"
			},
			{
				src: "tienhaara",
				dest: "th"
			},
			{
				src: "tori",
				dest: "tr"
			},
			{
				src: "väylä",
				dest: "vlä"
			}
		]
	}
];
var FR$1 = [
	{
		component: "road",
		replacements: [
			{
				src: "Avenue",
				dest: "Av"
			},
			{
				src: "Bâtiment",
				dest: "Bât"
			},
			{
				src: "Boulevard",
				dest: "Boul"
			},
			{
				src: "Cours",
				dest: "Crs"
			},
			{
				src: "Place",
				dest: "Pl"
			},
			{
				src: "Rue",
				dest: "r"
			},
			{
				src: "Saint",
				dest: "St"
			},
			{
				src: "Sainte",
				dest: "Ste"
			},
			{
				src: "Zone industrielle",
				dest: "Z.I"
			}
		]
	}
];
var GL$1 = [
	{
		component: "road",
		replacements: [
			{
				src: "Avenida",
				dest: "Avda"
			},
			{
				src: "Doutor",
				dest: "Dr"
			},
			{
				src: "Doutora",
				dest: "Dra"
			},
			{
				src: "Edificio",
				dest: "Edif"
			},
			{
				src: "Estrada",
				dest: "Estda"
			},
			{
				src: "Rúa",
				dest: "R/"
			},
			{
				src: "San",
				dest: "S"
			},
			{
				src: "Santa",
				dest: "Sta"
			},
			{
				src: "Santo",
				dest: "Sto"
			},
			{
				src: "Santas",
				dest: "Stas"
			},
			{
				src: "Santos",
				dest: "Stos"
			},
			{
				src: "Señora",
				dest: "Sra"
			},
			{
				src: "Urbanización",
				dest: "Urb"
			}
		]
	}
];
var HU$1 = [
	{
		component: "road",
		replacements: [
			{
				src: "utca",
				dest: "u"
			},
			{
				src: "körút",
				dest: "krt"
			}
		]
	}
];
var IT$1 = [
	{
		component: "road",
		replacements: [
			{
				src: "Calle",
				dest: "C.le"
			},
			{
				src: "Campo",
				dest: "C.po"
			},
			{
				src: "Cascina",
				dest: "C.na"
			},
			{
				src: "Corso",
				dest: "C.so"
			},
			{
				src: "Corte",
				dest: "C.te"
			},
			{
				src: "Fondamenta",
				dest: "F.te"
			},
			{
				src: "Largo",
				dest: "L.go"
			},
			{
				src: "Località",
				dest: "Loc."
			},
			{
				src: "Lungomare",
				dest: "L.mare"
			},
			{
				src: "Piazza",
				dest: "P.za"
			},
			{
				src: "Piazzale",
				dest: "P.le"
			},
			{
				src: "Piazzetta",
				dest: "P.ta"
			},
			{
				src: "Ponte",
				dest: "P.te"
			},
			{
				src: "Porta",
				dest: "P.ta"
			},
			{
				src: "Salizada",
				dest: "S.da"
			},
			{
				src: "San",
				dest: "S."
			},
			{
				src: "Santa",
				dest: "S."
			},
			{
				src: "Santo",
				dest: "S."
			},
			{
				src: "Santissima",
				dest: "SS.ma"
			},
			{
				src: "Santissime",
				dest: "SS.me"
			},
			{
				src: "Santissimi",
				dest: "SS.mi"
			},
			{
				src: "Santissimo",
				dest: "SS.mo"
			},
			{
				src: "Stazione",
				dest: "Staz"
			},
			{
				src: "Strada Comunale",
				dest: "SC"
			},
			{
				src: "Strada Provinciale",
				dest: "SP"
			},
			{
				src: "Strada Regionale",
				dest: "SR"
			},
			{
				src: "Strada Statale",
				dest: "SS"
			},
			{
				src: "Via",
				dest: "V"
			},
			{
				src: "Viale",
				dest: "V.le"
			},
			{
				src: "Vico",
				dest: "V.co"
			},
			{
				src: "Vicolo",
				dest: "V.lo"
			}
		]
	}
];
var NL$1 = [
	{
		component: "road",
		replacements: [
			{
				src: "Broeder",
				dest: "Br"
			},
			{
				src: "Burgemeester",
				dest: "Burg"
			},
			{
				src: "Commandant",
				dest: "Cmdt"
			},
			{
				src: "Docter",
				dest: "Dr"
			},
			{
				src: "Dokter",
				dest: "Dr"
			},
			{
				src: "Gebroeders",
				dest: "Gebr"
			},
			{
				src: "Generaal",
				dest: "Gen"
			},
			{
				src: "Gracht",
				dest: "Gr"
			},
			{
				src: "Ingenieur",
				dest: "Ir"
			},
			{
				src: "Jonkheer",
				dest: "Jhr"
			},
			{
				src: "Kardinaal",
				dest: "Kard"
			},
			{
				src: "Kolonel",
				dest: "Kol"
			},
			{
				src: "Koning",
				dest: "Kon"
			},
			{
				src: "Koningin",
				dest: "Kon"
			},
			{
				src: "Kort",
				dest: "K"
			},
			{
				src: "Korte",
				dest: "Kte"
			},
			{
				src: "Laan",
				dest: "ln"
			},
			{
				src: "Lange",
				dest: "L"
			},
			{
				src: "Luitenant",
				dest: "Luit"
			},
			{
				src: "Markt",
				dest: "mkt"
			},
			{
				src: "Mejuffrouw",
				dest: "Mej"
			},
			{
				src: "Mevrouw",
				dest: "Mevr"
			},
			{
				src: "Minister",
				dest: "Min"
			},
			{
				src: "Monseigneur",
				dest: "Mgr"
			},
			{
				src: "Noordzijde",
				dest: "NZ"
			},
			{
				src: "Onze-Lieve-Vrouw",
				dest: "OLV"
			},
			{
				src: "Oostzijde",
				dest: "OZ"
			},
			{
				src: "Pastoor",
				dest: "Past"
			},
			{
				src: "Prins",
				dest: "Pr"
			},
			{
				src: "Prinses",
				dest: "Pr"
			},
			{
				src: "Professor",
				dest: "Prof"
			},
			{
				src: "Sint",
				dest: "St"
			},
			{
				src: "Straat",
				dest: "str"
			},
			{
				src: "Van",
				dest: "v"
			},
			{
				src: "Van der",
				dest: "vd"
			},
			{
				src: "Van den",
				dest: "vd"
			},
			{
				src: "Verlengde",
				dest: "Verl"
			},
			{
				src: "Vrouwe",
				dest: "Vr"
			},
			{
				src: "Weg",
				dest: "wg"
			},
			{
				src: "Westzijde",
				dest: "WZ"
			},
			{
				src: "Zuidzijde",
				dest: "ZZ"
			},
			{
				src: "Zuster",
				dest: "Zr"
			}
		]
	}
];
var NO$1 = [
	{
		component: "road",
		replacements: [
			{
				src: "gata",
				dest: "g"
			},
			{
				src: "gate",
				dest: "g"
			},
			{
				src: "gaten",
				dest: "g"
			},
			{
				src: "plass",
				dest: "pl"
			},
			{
				src: "plassen",
				dest: "pl"
			},
			{
				src: "sving",
				dest: "sv"
			},
			{
				src: "svingen",
				dest: "sv"
			},
			{
				src: "veg",
				dest: "v"
			},
			{
				src: "vegen",
				dest: "v"
			},
			{
				src: "vei",
				dest: "v"
			},
			{
				src: "veien",
				dest: "v"
			}
		]
	}
];
var PL$1 = [
	{
		component: "road",
		replacements: [
			{
				src: "Aleja",
				dest: "al."
			},
			{
				src: "Aleje",
				dest: "al."
			},
			{
				src: "Alei",
				dest: "al."
			},
			{
				src: "Alejach",
				dest: "al."
			},
			{
				src: "Aleją",
				dest: "al."
			},
			{
				src: "Biskupa",
				dest: "bpa."
			},
			{
				src: "Biskup",
				dest: "bp."
			},
			{
				src: "Doktora",
				dest: "dr."
			},
			{
				src: "Księcia",
				dest: "ks."
			},
			{
				src: "Księdza",
				dest: "ks."
			},
			{
				src: "Kardynała",
				dest: "kard."
			},
			{
				src: "Marszałka",
				dest: "marsz."
			},
			{
				src: "Majora",
				dest: "mjr."
			},
			{
				src: "Plac",
				dest: "pl."
			},
			{
				src: "Placu",
				dest: "pl."
			},
			{
				src: "Placem",
				dest: "pl."
			},
			{
				src: "Profesora",
				dest: "prof."
			},
			{
				src: "Pułkownika",
				dest: "płk."
			},
			{
				src: "Rotmistrza",
				dest: "rotm."
			},
			{
				src: "Ulica",
				dest: "ul."
			},
			{
				src: "Ulice",
				dest: "ul."
			},
			{
				src: "Ulicą",
				dest: "ul."
			},
			{
				src: "Ulicy",
				dest: "ul."
			}
		]
	}
];
var PT$1 = [
	{
		component: "road",
		replacements: [
			{
				src: "Alameda",
				dest: "Al"
			},
			{
				src: "Avenida",
				dest: "Av"
			},
			{
				src: "Azinhaga",
				dest: "Az"
			},
			{
				src: "Bairro",
				dest: "Br"
			},
			{
				src: "Beco",
				dest: "Bc"
			},
			{
				src: "Bloco",
				dest: "Bl"
			},
			{
				src: "Calçada",
				dest: "Cc"
			},
			{
				src: "Calçadinha",
				dest: "Ccnh"
			},
			{
				src: "Caminho",
				dest: "Cam"
			},
			{
				src: "Casal",
				dest: "Csl"
			},
			{
				src: "Departamento",
				dest: "Dept"
			},
			{
				src: "Doutor",
				dest: "Dr"
			},
			{
				src: "Doutora",
				dest: "Drª"
			},
			{
				src: "Embaixador",
				dest: "Emb"
			},
			{
				src: "Escadas",
				dest: "Esc"
			},
			{
				src: "Escadinhas",
				dest: "Escnh"
			},
			{
				src: "Estrada",
				dest: "Estr"
			},
			{
				src: "Gaveto",
				dest: "Gav"
			},
			{
				src: "General",
				dest: "Gen"
			},
			{
				src: "Jardim",
				dest: "Jrd"
			},
			{
				src: "Largo",
				dest: "Lg"
			},
			{
				src: "Loteamento",
				dest: "Loteam"
			},
			{
				src: "Lugar",
				dest: "Lg"
			},
			{
				src: "Padre",
				dest: "Pe"
			},
			{
				src: "Parque",
				dest: "Pq"
			},
			{
				src: "Pátio",
				dest: "Pto"
			},
			{
				src: "Praça",
				dest: "Pc"
			},
			{
				src: "Praceta",
				dest: "Pct"
			},
			{
				src: "Professor",
				dest: "Prof"
			},
			{
				src: "Professora",
				dest: "Profª"
			},
			{
				src: "Prolongamento",
				dest: "Prolng"
			},
			{
				src: "Quinta",
				dest: "Qta"
			},
			{
				src: "Ribeira",
				dest: "Rib"
			},
			{
				src: "Rio",
				dest: "R"
			},
			{
				src: "Rotunda",
				dest: "Rot"
			},
			{
				src: "Rua",
				dest: "R"
			},
			{
				src: "Santa",
				dest: "Sta"
			},
			{
				src: "Santo",
				dest: "St"
			},
			{
				src: "São",
				dest: "S"
			},
			{
				src: "Senhor",
				dest: "S"
			},
			{
				src: "Senhora",
				dest: "Sª"
			},
			{
				src: "Torre",
				dest: "Tr"
			},
			{
				src: "Transversal",
				dest: "Transv"
			},
			{
				src: "Travessa",
				dest: "Tv"
			},
			{
				src: "Urbanização",
				dest: "Urb"
			},
			{
				src: "Vila",
				dest: "Vl"
			},
			{
				src: "Zona",
				dest: "Zn"
			}
		]
	}
];
var RO$1 = [
	{
		component: "road",
		replacements: [
			{
				src: "Aleea",
				dest: "Ale"
			},
			{
				src: "Bulevardul",
				dest: "Blvd"
			},
			{
				src: "Calea",
				dest: "Cal"
			},
			{
				src: "Fundătura",
				dest: "Fnd"
			},
			{
				src: "Intrarea",
				dest: "Intr"
			},
			{
				src: "Piața",
				dest: "Pța"
			},
			{
				src: "Soseaua",
				dest: "Sos"
			},
			{
				src: "Șoseaua",
				dest: "Sos"
			},
			{
				src: "Strada",
				dest: "Str"
			},
			{
				src: "Stradela",
				dest: "Sdla"
			}
		]
	}
];
var RU$1 = [
	{
		component: "country",
		replacements: [
			{
				src: "Российская Федерация",
				dest: "РФ"
			}
		]
	},
	{
		component: "state",
		replacements: [
			{
				src: "автономный округ",
				dest: "АО"
			},
			{
				src: "автономная область",
				dest: "Аобл"
			},
			{
				src: "область",
				dest: "обл"
			},
			{
				src: "Республика",
				dest: "Респ"
			}
		]
	},
	{
		component: "county",
		replacements: [
			{
				src: "городской округ",
				dest: "г.о."
			},
			{
				src: "сельский округ",
				dest: "с.о."
			},
			{
				src: "район",
				dest: "р-н"
			}
		]
	},
	{
		component: "city",
		replacements: [
			{
				src: "город",
				dest: "г"
			},
			{
				src: "сельское поселение",
				dest: "с.п."
			},
			{
				src: "сельский совет",
				dest: "с.с."
			}
		]
	},
	{
		component: "village",
		replacements: [
			{
				src: "поселок",
				dest: "пос"
			},
			{
				src: "посёлок",
				dest: "пос"
			},
			{
				src: "дачный поселок",
				dest: "дп"
			},
			{
				src: "дачный посёлок",
				dest: "дп"
			},
			{
				src: "деревня",
				dest: "д"
			},
			{
				src: "курортный поселок",
				dest: "кп"
			},
			{
				src: "курортный посёлок",
				dest: "кп"
			},
			{
				src: "местечко",
				dest: "м"
			},
			{
				src: "село",
				dest: "с"
			},
			{
				src: "станица",
				dest: "ст-ца"
			},
			{
				src: "поселок городского типа",
				dest: "пгт"
			},
			{
				src: "посёлок городского типа",
				dest: "пгт"
			}
		]
	},
	{
		component: "neighbourhood",
		replacements: [
			{
				src: "квартал",
				dest: "кв-л"
			},
			{
				src: "район",
				dest: "р-н"
			},
			{
				src: "микрорайон",
				dest: "мкр"
			}
		]
	},
	{
		component: "road",
		replacements: [
			{
				src: "улица",
				dest: "ул"
			},
			{
				src: "дорога",
				dest: "дор"
			},
			{
				src: "переулок",
				dest: "пер"
			},
			{
				src: "шоссе",
				dest: "ш"
			},
			{
				src: "проспект",
				dest: "пр-кт"
			},
			{
				src: "проезд",
				dest: "пр"
			},
			{
				src: "площадь",
				dest: "пл"
			},
			{
				src: "бульвар",
				dest: "б-р"
			},
			{
				src: "набережная",
				dest: "наб"
			},
			{
				src: "корпус",
				dest: "корп"
			},
			{
				src: "строение",
				dest: "стр"
			},
			{
				src: "тупик",
				dest: "туп"
			}
		]
	}
];
var SK$1 = [
	{
		component: "road",
		replacements: [
			{
				src: "Armádneho generála",
				dest: "Arm. gen"
			},
			{
				src: "Československej",
				dest: "Čsl"
			},
			{
				src: "Doktora",
				dest: "Dr"
			},
			{
				src: "Doktorky",
				dest: "Dr"
			},
			{
				src: "Generála",
				dest: "Gen"
			},
			{
				src: "Inžiniera",
				dest: "Ing"
			},
			{
				src: "Inžinierky",
				dest: "Ing"
			},
			{
				src: "Kapitána",
				dest: "Kpt"
			},
			{
				src: "Majora",
				dest: "Mjr"
			},
			{
				src: "Nábrežie",
				dest: "Nábr"
			},
			{
				src: "Námestie",
				dest: "Nám"
			},
			{
				src: "Plukovníka",
				dest: "Plk"
			},
			{
				src: "Podplukovníka",
				dest: "Pplk"
			},
			{
				src: "Podporučíka",
				dest: "Ppor"
			},
			{
				src: "Poručíka",
				dest: "Por"
			},
			{
				src: "Profesora",
				dest: "Prof"
			},
			{
				src: "Profesorky",
				dest: "Prof"
			},
			{
				src: "Sídlisko",
				dest: "Sídl"
			},
			{
				src: "Svätého",
				dest: "Sv"
			},
			{
				src: "Svätej",
				dest: "Sv"
			},
			{
				src: "Ulica",
				dest: "Ul"
			}
		]
	}
];
var SL$1 = [
	{
		component: "road",
		replacements: [
			{
				src: "Cesta",
				dest: "C"
			},
			{
				src: "Slovenskih",
				dest: "Slov"
			},
			{
				src: "Spodnja",
				dest: "Sp"
			},
			{
				src: "Spodnje",
				dest: "Sp"
			},
			{
				src: "Spodnji",
				dest: "Sp"
			},
			{
				src: "Srednja",
				dest: "Sr"
			},
			{
				src: "Srednje",
				dest: "Sr"
			},
			{
				src: "Srednji",
				dest: "Sr"
			},
			{
				src: "Sveta",
				dest: "Sv"
			},
			{
				src: "Svete",
				dest: "Sv"
			},
			{
				src: "Sveti",
				dest: "Sv"
			},
			{
				src: "Svetega",
				dest: "Sv"
			},
			{
				src: "Šent",
				dest: "Št"
			},
			{
				src: "Ulica",
				dest: "Ul"
			},
			{
				src: "Velika",
				dest: "Vel"
			},
			{
				src: "Velike",
				dest: "Vel"
			},
			{
				src: "Veliki",
				dest: "Vel"
			},
			{
				src: "Veliko",
				dest: "Vel"
			},
			{
				src: "Velikem",
				dest: "Vel"
			},
			{
				src: "Zgornja",
				dest: "Zg"
			},
			{
				src: "Zgornje",
				dest: "Zg"
			},
			{
				src: "Zgornji",
				dest: "Zg"
			}
		]
	}
];
var SV$1 = [
	{
		component: "road",
		replacements: [
			{
				src: "gata",
				dest: "g"
			},
			{
				src: "gatan",
				dest: "g"
			},
			{
				src: "gränd",
				dest: "gr"
			},
			{
				src: "gränden",
				dest: "gr"
			},
			{
				src: "lilla",
				dest: "l"
			},
			{
				src: "norra",
				dest: "n"
			},
			{
				src: "östra",
				dest: "ö"
			},
			{
				src: "södra",
				dest: "s"
			},
			{
				src: "stig",
				dest: "st"
			},
			{
				src: "stora",
				dest: "st"
			},
			{
				src: "västra",
				dest: "v"
			}
		]
	}
];
var TR$1 = [
	{
		component: "road",
		replacements: [
			{
				src: "Bulvar",
				dest: "Bl"
			},
			{
				src: "Bulvarı",
				dest: "Bl"
			},
			{
				src: "Cadde",
				dest: "Cd"
			},
			{
				src: "Caddesi",
				dest: "Cd"
			},
			{
				src: "Mahalle",
				dest: "Mh"
			},
			{
				src: "Sokak",
				dest: "Sk"
			},
			{
				src: "Sokağı",
				dest: "Sk"
			}
		]
	}
];
var UK = [
	{
		component: "road",
		replacements: [
			{
				src: "бульвар",
				dest: "бул"
			},
			{
				src: "дорога",
				dest: "дор"
			},
			{
				src: "провулок",
				dest: "пров"
			},
			{
				src: "площа",
				dest: "пл"
			},
			{
				src: "проспект",
				dest: "просп"
			},
			{
				src: "шосе",
				dest: "ш"
			},
			{
				src: "вулиця",
				dest: "вул"
			}
		]
	}
];
var VI$1 = [
	{
		component: "road",
		replacements: [
			{
				src: "Công trường",
				dest: "CT"
			},
			{
				src: "Đại lộ",
				dest: "ĐL"
			},
			{
				src: "Đường",
				dest: "D"
			},
			{
				src: "Quảng trường",
				dest: "QT"
			}
		]
	}
];
var abbreviations = {
	CA: CA$1,
	CS: CS,
	DA: DA,
	DE: DE$1,
	EN: EN,
	ES: ES$1,
	ET: ET$1,
	EU: EU,
	FI: FI$1,
	FR: FR$1,
	GL: GL$1,
	HU: HU$1,
	IT: IT$1,
	NL: NL$1,
	NO: NO$1,
	PL: PL$1,
	PT: PT$1,
	RO: RO$1,
	RU: RU$1,
	SK: SK$1,
	SL: SL$1,
	SV: SV$1,
	TR: TR$1,
	UK: UK,
	VI: VI$1
};

var knownComponents = aliases.map(function (a) {
  return a.alias;
});
var VALID_REPLACEMENT_COMPONENTS = ['state'];
var SMALL_DISTRICT_COUNTRIES = {
  BR: 1,
  CR: 1,
  ES: 1,
  NI: 1,
  PY: 1,
  RO: 1,
  TG: 1,
  TM: 1,
  XK: 1
};
var determineCountryCode = function determineCountryCode(input) {
  var fallbackCountryCode = arguments.length > 1 && arguments[1] !== undefined ? arguments[1] : null;
  var countryCode = input.country_code && input.country_code.toUpperCase();
  if (!templates[countryCode] && fallbackCountryCode) {
    countryCode = fallbackCountryCode.toUpperCase();
  }
  if (!countryCode || countryCode.length !== 2) {
    // TODO change this to exceptions
    return input;
  }
  if (countryCode === 'UK') {
    countryCode = 'GB';
  }
  if (templates[countryCode] && templates[countryCode].use_country) {
    var oldCountryCode = countryCode;
    countryCode = templates[countryCode].use_country.toUpperCase();
    if (templates[oldCountryCode].change_country) {
      var newCountry = templates[oldCountryCode].change_country;
      var componentRegex = /\$(\w*)/;
      var componentMatch = componentRegex.exec(newCountry);
      if (componentMatch) {
        if (input[componentMatch[1]]) {
          newCountry = newCountry.replace(new RegExp("\\$".concat(componentMatch[1])), input[componentMatch[1]]);
        } else {
          newCountry = newCountry.replace(new RegExp("\\$".concat(componentMatch[1])), '');
        }
      }
      input.country = newCountry;
    }
    if (templates[oldCountryCode].add_component && templates[oldCountryCode].add_component.indexOf('=') > -1) {
      var splitted = templates[oldCountryCode].add_component.split('=');
      if (VALID_REPLACEMENT_COMPONENTS.indexOf(splitted[0]) > -1) {
        input[splitted[0]] = splitted[1];
      }
    }
  }
  if (countryCode === 'NL' && input.state) {
    if (input.state === 'Curaçao') {
      countryCode = 'CW';
      input.country = 'Curaçao';
    } else if (input.state.match(/sint maarten/i)) {
      countryCode = 'SX';
      input.country = 'Sint Maarten';
    } else if (input.state.match(/aruba/i)) {
      countryCode = 'AW';
      input.country = 'Aruba';
    }
  }

  // eslint-disable-next-line camelcase
  input.country_code = countryCode;
  return input;
};
var normalizeComponentKeys = function normalizeComponentKeys(input) {
  var inputKeys = Object.keys(input);
  for (var i = 0; i < inputKeys.length; i++) {
    var snaked = inputKeys[i].replace(/([A-Z])/g, '_$1').toLowerCase();
    if (knownComponents.indexOf(snaked) > -1 && !input[snaked]) {
      if (input[inputKeys[i]]) {
        input[snaked] = input[inputKeys[i]];
      }
      delete input[inputKeys[i]];
    }
  }
  return input;
};
var applyAliases = function applyAliases(input) {
  var inputKeys = Object.keys(input);
  var tailoredAliases = aliases;
  if (!SMALL_DISTRICT_COUNTRIES[input.country_code]) {
    tailoredAliases = aliases.filter(function (a) {
      return a.alias !== 'district';
    });
    tailoredAliases.push({
      alias: 'district',
      name: 'state_district'
    });
  }
  var _loop = function _loop(i) {
    var alias = tailoredAliases.find(function (a) {
      return a.alias === inputKeys[i];
    });
    if (alias && !input[alias.name]) {
      input[alias.name] = input[alias.alias];
    }
  };
  for (var i = 0; i < inputKeys.length; i++) {
    _loop(i);
  }
  return input;
};
var getStateCode = function getStateCode(state, countryCode) {
  if (!stateCodes[countryCode]) {
    return;
  }
  // TODO what if state is actually the stateCode?
  // https://github.com/OpenCageData/perl-Geo-Address-Formatter/blob/master/lib/Geo/Address/Formatter.pm#L526
  var found = stateCodes[countryCode].find(function (e) {
    if (typeof e.name === 'string' && e.name.toUpperCase() === state.toUpperCase()) {
      return e;
    }
    var variants = Object.values(e.name);
    var foundVariant = variants.find(function (e) {
      return e.toUpperCase() === state.toUpperCase();
    });
    if (foundVariant) {
      return {
        key: e.key
      };
    }
    return false;
  });
  return found && found.key;
};
var getCountyCode = function getCountyCode(county, countryCode) {
  if (!countyCodes[countryCode]) {
    return;
  }
  // TODO what if county is actually the countyCode?
  var found = countyCodes[countryCode].find(function (e) {
    if (typeof e.name === 'string' && e.name.toUpperCase() === county.toUpperCase()) {
      return e;
    }
    var variants = Object.values(e.name);
    var foundVariant = variants.find(function (e) {
      return e.toUpperCase() === county.toUpperCase();
    });
    if (foundVariant) {
      return {
        key: e.key
      };
    }
    return false;
  });
  return found && found.key;
};
var cleanupInput = function cleanupInput(input) {
  var replacements = arguments.length > 1 && arguments[1] !== undefined ? arguments[1] : [];
  var options = arguments.length > 2 && arguments[2] !== undefined ? arguments[2] : {};
  // If the country is a number, use the state as country
  var inputKeys = Object.keys(input);
  if (input.country && input.state && Number.isInteger(input.country)) {
    input.country = input.state;
    delete input.state;
  }
  if (replacements && replacements.length) {
    for (var i = 0; i < inputKeys.length; i++) {
      for (var j = 0; j < replacements.length; j++) {
        var componentRegex = new RegExp("^".concat(inputKeys[i], "="));
        if (replacements[j][0].match(componentRegex)) {
          var val = replacements[j][0].replace(componentRegex, '');
          var valRegex = new RegExp(val);
          if (input[inputKeys[i]].match(valRegex)) {
            input[inputKeys[i]] = input[inputKeys[i]].replace(valRegex, replacements[j][1]);
          }
        } else {
          input[inputKeys[i]] = "".concat(input[inputKeys[i]]).replace(new RegExp(replacements[j][0]), replacements[j][1]);
        }
      }
    }
  }
  if (!input.state_code && input.state) {
    // eslint-disable-next-line camelcase
    input.state_code = getStateCode(input.state, input.country_code);
    if (input.state.match(/^washington,? d\.?c\.?/i)) {
      // eslint-disable-next-line camelcase
      input.state_code = 'DC';
      input.state = 'District of Columbia';
      input.city = 'Washington';
    }
  }
  if (!input.county_code && input.county) {
    // eslint-disable-next-line camelcase
    input.county_code = getCountyCode(input.county, input.country_code);
  }
  var unknownComponents = [];
  for (var _i = 0; _i < inputKeys.length; _i++) {
    if (knownComponents.indexOf(inputKeys[_i]) === -1) {
      unknownComponents.push(inputKeys[_i]);
    }
  }
  if (unknownComponents.length) {
    input.attention = unknownComponents.map(function (c) {
      return input[c];
    }).join(', ');
  }
  if (input.postcode && options.cleanupPostcode !== false) {
    // convert to string
    input.postcode = "".concat(input.postcode);
    var multiCodeRegex = /^(\d{5}),\d{5}/;
    var multiCodeMatch = multiCodeRegex.exec(input.postcode);
    if (input.postcode.length > 20) {
      delete input.postcode;
      // OSM may use postcode ranges
    } else if (input.postcode.match(/\d+;\d+/)) {
      delete input.postcode;
    } else if (multiCodeMatch) {
      input.postcode = multiCodeMatch[1];
    }
  }
  if (options.abbreviate && input.country_code && country2lang[input.country_code]) {
    for (var _i2 = 0; _i2 < country2lang[input.country_code].length; _i2++) {
      var lang = country2lang[input.country_code][_i2];
      if (abbreviations[lang]) {
        for (var _j = 0; _j < abbreviations[lang].length; _j++) {
          if (input[abbreviations[lang][_j].component]) {
            for (var k = 0; k < abbreviations[lang][_j].replacements.length; k++) {
              input[abbreviations[lang][_j].component] = input[abbreviations[lang][_j].component].replace(new RegExp("\\b".concat(abbreviations[lang][_j].replacements[k].src, "\\b")), abbreviations[lang][_j].replacements[k].dest);
            }
          }
        }
      }
    }
  }

  // naive url cleanup, keys might have changed along the cleanup
  inputKeys = Object.keys(input);
  for (var _i3 = 0; _i3 < inputKeys.length; _i3++) {
    if ("".concat(input[inputKeys[_i3]]).match(/^https?:\/\//i)) {
      delete input[inputKeys[_i3]];
    }
  }
  return input;
};
var findTemplate = function findTemplate(input) {
  return templates[input.country_code] ? templates[input.country_code] : templates.default;
};
var chooseTemplateText = function chooseTemplateText(template, input) {
  var selected = template.address_template || templates.default.address_template;
  var threshold = 2;
  // Choose fallback only when none of these is present
  var required = ['road', 'postcode'];
  var missingValuesCnt = required.map(function (r) {
    return !!input[r];
  }).filter(function (s) {
    return !s;
  }).length;
  if (missingValuesCnt === threshold) {
    selected = template.fallback_template || templates.default.fallback_template;
  }
  return selected;
};
var cleanupRender = function cleanupRender(text) {
  var replacements = [
  // eslint-disable-next-line no-useless-escape
  {
    s: /[\t-\r ,\}\xA0\u1680\u2000-\u200A\u2028\u2029\u202F\u205F\u3000\uFEFF]+$/,
    d: ''
  }, {
    s: /^[\t-\r ,\xA0\u1680\u2000-\u200A\u2028\u2029\u202F\u205F\u3000\uFEFF]+/,
    d: ''
  }, {
    s: /^\x2D /,
    d: ''
  },
  // line starting with dash due to a parameter missing
  {
    s: /,[\t-\r \xA0\u1680\u2000-\u200A\u2028\u2029\u202F\u205F\u3000\uFEFF]*,/,
    d: ', '
  },
  // multiple commas to one
  {
    s: /[\t ]+,[\t ]+/,
    d: ', '
  },
  // one horiz whitespace behind comma
  {
    s: /[\t ][\t ]+/,
    d: ' '
  },
  // multiple horiz whitespace to one
  {
    s: /[\t ]\n/,
    d: '\n'
  },
  // horiz whitespace, newline to newline
  {
    s: /\n,/,
    d: '\n'
  },
  // newline comma to just newline
  {
    s: /,,+/,
    d: ','
  },
  // multiple commas to one
  {
    s: /,\n/,
    d: '\n'
  },
  // comma newline to just newline
  {
    s: /\n[\t ]+/,
    d: '\n'
  },
  // newline plus space to newline
  {
    s: /\n\n+/,
    d: '\n'
  } // multiple newline to one
  ];
  var dedupe = function dedupe(inputChunks, glue) {
    var modifier = arguments.length > 2 && arguments[2] !== undefined ? arguments[2] : function (s) {
      return s;
    };
    var seen = {};
    var result = [];
    for (var i = 0; i < inputChunks.length; i++) {
      var chunk = inputChunks[i].trim();
      // Special casing New York here, no dedupe for it
      if (chunk.toLowerCase() === 'new york') {
        seen[chunk] = 1;
        result.push(chunk);
        continue;
      }
      if (!seen[chunk]) {
        seen[chunk] = 1;
        result.push(modifier(chunk));
      }
    }
    return result.join(glue);
  };
  for (var i = 0; i < replacements.length; i++) {
    text = text.replace(replacements[i].s, replacements[i].d);
    text = dedupe(text.split('\n'), '\n', function (s) {
      return dedupe(s.split(', '), ', ');
    });
  }
  return text.trim();
};
var renderTemplate = function renderTemplate(template, input) {
  var templateText = chooseTemplateText(template, input);
  var templateInput = Object.assign({}, input, {
    first: function first() {
      return function (text, render) {
        var possibilities = render(text, input).split(/\s*\|\|\s*/).filter(function (b) {
          return b.length > 0;
        });
        return possibilities.length ? possibilities[0] : '';
      };
    }
  });
  var render = cleanupRender(mustache.render(templateText, templateInput));
  if (template.postformat_replace) {
    for (var i = 0; i < template.postformat_replace.length; i++) {
      var replacement = template.postformat_replace[i];
      render = render.replace(new RegExp(replacement[0]), replacement[1]);
    }
  }
  render = cleanupRender(render);
  if (!render.trim().length) {
    render = cleanupRender(Object.keys(input).map(function (i) {
      return input[i];
    }).filter(function (s) {
      return !!s;
    }).join(', '));
  }
  return render + '\n';
};

var AD = "Andorra";
var AE = "United Arab Emirates";
var AF = "Afghanistan";
var AG = "Antigua and Barbuda";
var AI = "Anguilla";
var AL = "Albania";
var AM = "Armenia";
var AO = "Angola";
var AQ = "Antarctica";
var AR = "Argentina";
var AS = "American Samoa";
var AT = "Austria";
var AU = "Australia";
var AW = "Aruba";
var AX = "Åland Islands";
var AZ = "Azerbaijan";
var BA = "Bosnia and Herzegovina";
var BB = "Barbados";
var BD = "Bangladesh";
var BE = "Belgium";
var BF = "Burkina Faso";
var BG = "Bulgaria";
var BH = "Bahrain";
var BI = "Burundi";
var BJ = "Benin";
var BL = "Saint Barthélemy";
var BM = "Bermuda";
var BN = "Brunei";
var BO = "Bolivia";
var BQ = "Caribbean Netherlands";
var BR = "Brazil";
var BS = "The Bahamas";
var BT = "Bhutan";
var BV = "Bouvet Island";
var BW = "Botswana";
var BY = "Belarus";
var BZ = "Belize";
var CA = "Canada";
var CC = "Cocos (Keeling) Islands";
var CD = "Democratic Republic of the Congo";
var CF = "Central African Republic";
var CG = "Republic of the Congo";
var CH = "Switzerland";
var CI = "Côte d'Ivoire";
var CK = "Cook Islands";
var CL = "Chile";
var CM = "Cameroon";
var CN = "China";
var CO = "Colombia";
var CR = "Costa Rica";
var CU = "Cuba";
var CV = "Cabo Verde";
var CW = "Curaçao";
var CX = "Christmas Island";
var CY = "Cyprus";
var CZ = "Czech Republic";
var DE = "Germany";
var DJ = "Djibouti";
var DK = "Denmark";
var DM = "Dominica";
var DO = "Dominican Republic";
var DZ = "Algeria";
var EC = "Ecuador";
var EE = "Estonia";
var EG = "Egypt";
var EH = "Western Sahara";
var ER = "Eritrea";
var ES = "Spain";
var ET = "Ethiopia";
var FI = "Finland";
var FJ = "Fiji";
var FK = "Falkland Islands";
var FM = "Federated States of Micronesia";
var FO = "Faroe Islands";
var FR = "France";
var GA = "Gabon";
var GB = "United Kingdom";
var GD = "Grenada";
var GE = "Georgia (country)";
var GF = "French Guiana";
var GG = "Guernsey";
var GH = "Ghana";
var GI = "Gibraltar";
var GL = "Greenland";
var GM = "The Gambia";
var GN = "Guinea";
var GP = "Guadeloupe";
var GQ = "Equatorial Guinea";
var GR = "Greece";
var GS = "South Georgia and the South Sandwich Islands";
var GT = "Guatemala";
var GU = "Guam";
var GW = "Guinea-Bissau";
var GY = "Guyana";
var HK = "Hong Kong";
var HM = "Heard Island and McDonald Islands";
var HN = "Honduras";
var HR = "Croatia";
var HT = "Haiti";
var HU = "Hungary";
var ID = "Indonesia";
var IE = "Republic of Ireland";
var IL = "Israel";
var IM = "Isle of Man";
var IN = "India";
var IO = "British Indian Ocean Territory";
var IQ = "Iraq";
var IR = "Iran";
var IS = "Iceland";
var IT = "Italy";
var JE = "Jersey";
var JM = "Jamaica";
var JO = "Jordan";
var JP = "Japan";
var KE = "Kenya";
var KG = "Kyrgyzstan";
var KH = "Cambodia";
var KI = "Kiribati";
var KM = "Comoros";
var KN = "Saint Kitts and Nevis";
var KP = "North Korea";
var KR = "South Korea";
var KW = "Kuwait";
var KY = "Cayman Islands";
var KZ = "Kazakhstan";
var LA = "Laos";
var LB = "Lebanon";
var LC = "Saint Lucia";
var LI = "Liechtenstein";
var LK = "Sri Lanka";
var LR = "Liberia";
var LS = "Lesotho";
var LT = "Lithuania";
var LU = "Luxembourg";
var LV = "Latvia";
var LY = "Libya";
var MA = "Morocco";
var MC = "Monaco";
var MD = "Moldova";
var ME = "Montenegro";
var MF = "Collectivity of Saint Martin";
var MG = "Madagascar";
var MH = "Marshall Islands";
var MK = "Republic of North Macedonia";
var ML = "Mali";
var MM = "Myanmar";
var MN = "Mongolia";
var MO = "Macau";
var MP = "Northern Mariana Islands";
var MQ = "Martinique";
var MR = "Mauritania";
var MS = "Montserrat";
var MT = "Malta";
var MU = "Mauritius";
var MV = "Maldives";
var MW = "Malawi";
var MX = "Mexico";
var MY = "Malaysia";
var MZ = "Mozambique";
var NA = "Namibia";
var NC = "New Caledonia";
var NE = "Niger";
var NF = "Norfolk Island";
var NG = "Nigeria";
var NI = "Nicaragua";
var NL = "Netherlands";
var NO = "Norway";
var NP = "Nepal";
var NR = "Nauru";
var NU = "Niue";
var NZ = "New Zealand";
var OM = "Oman";
var PA = "Panama";
var PE = "Peru";
var PF = "French Polynesia";
var PG = "Papua New Guinea";
var PH = "Philippines";
var PK = "Pakistan";
var PL = "Poland";
var PM = "Saint Pierre and Miquelon";
var PN = "Pitcairn Islands";
var PR = "Puerto Rico";
var PS = "State of Palestine";
var PT = "Portugal";
var PW = "Palau";
var PY = "Paraguay";
var QA = "Qatar";
var RE = "Réunion";
var RO = "Romania";
var RS = "Serbia";
var RU = "Russia";
var RW = "Rwanda";
var SA = "Saudi Arabia";
var SB = "Solomon Islands";
var SC = "Seychelles";
var SD = "Sudan";
var SE = "Sweden";
var SG = "Singapore";
var SH = "Saint Helena, Ascension and Tristan da Cunha";
var SI = "Slovenia";
var SJ = "Svalbard and Jan Mayen";
var SK = "Slovakia";
var SL = "Sierra Leone";
var SM = "San Marino";
var SN = "Senegal";
var SO = "Somalia";
var SR = "Suriname";
var SS = "South Sudan";
var ST = "São Tomé and Príncipe";
var SV = "El Salvador";
var SX = "Sint Maarten";
var SY = "Syria";
var SZ = "Eswatini (Swaziland)";
var TC = "Turks and Caicos Islands";
var TD = "Chad";
var TF = "French Southern and Antarctic Lands";
var TG = "Togo";
var TH = "Thailand";
var TJ = "Tajikistan";
var TK = "Tokelau";
var TL = "East Timor";
var TM = "Turkmenistan";
var TN = "Tunisia";
var TO = "Tonga";
var TR = "Türkiye (Turkey)";
var TT = "Trinidad and Tobago";
var TV = "Tuvalu";
var TW = "Taiwan";
var TZ = "Tanzania";
var UA = "Ukraine";
var UG = "Uganda";
var UM = "United States Minor Outlying Islands";
var US = "United States";
var UY = "Uruguay";
var UZ = "Uzbekistan";
var VA = "Vatican City";
var VC = "Saint Vincent and the Grenadines";
var VE = "Venezuela";
var VG = "British Virgin Islands";
var VI = "United States Virgin Islands";
var VN = "Vietnam";
var VU = "Vanuatu";
var WF = "Wallis and Futuna";
var WS = "Samoa";
var XC = "Sovereign Base Areas of Akrotiri and Dhekelia";
var XK = "Kosovo";
var YE = "Yemen";
var YT = "Mayotte";
var ZA = "South Africa";
var ZM = "Zambia";
var ZW = "Zimbabwe";
var countryNames = {
	AD: AD,
	AE: AE,
	AF: AF,
	AG: AG,
	AI: AI,
	AL: AL,
	AM: AM,
	AO: AO,
	AQ: AQ,
	AR: AR,
	AS: AS,
	AT: AT,
	AU: AU,
	AW: AW,
	AX: AX,
	AZ: AZ,
	BA: BA,
	BB: BB,
	BD: BD,
	BE: BE,
	BF: BF,
	BG: BG,
	BH: BH,
	BI: BI,
	BJ: BJ,
	BL: BL,
	BM: BM,
	BN: BN,
	BO: BO,
	BQ: BQ,
	BR: BR,
	BS: BS,
	BT: BT,
	BV: BV,
	BW: BW,
	BY: BY,
	BZ: BZ,
	CA: CA,
	CC: CC,
	CD: CD,
	CF: CF,
	CG: CG,
	CH: CH,
	CI: CI,
	CK: CK,
	CL: CL,
	CM: CM,
	CN: CN,
	CO: CO,
	CR: CR,
	CU: CU,
	CV: CV,
	CW: CW,
	CX: CX,
	CY: CY,
	CZ: CZ,
	DE: DE,
	DJ: DJ,
	DK: DK,
	DM: DM,
	DO: DO,
	DZ: DZ,
	EC: EC,
	EE: EE,
	EG: EG,
	EH: EH,
	ER: ER,
	ES: ES,
	ET: ET,
	FI: FI,
	FJ: FJ,
	FK: FK,
	FM: FM,
	FO: FO,
	FR: FR,
	GA: GA,
	GB: GB,
	GD: GD,
	GE: GE,
	GF: GF,
	GG: GG,
	GH: GH,
	GI: GI,
	GL: GL,
	GM: GM,
	GN: GN,
	GP: GP,
	GQ: GQ,
	GR: GR,
	GS: GS,
	GT: GT,
	GU: GU,
	GW: GW,
	GY: GY,
	HK: HK,
	HM: HM,
	HN: HN,
	HR: HR,
	HT: HT,
	HU: HU,
	ID: ID,
	IE: IE,
	IL: IL,
	IM: IM,
	IN: IN,
	IO: IO,
	IQ: IQ,
	IR: IR,
	IS: IS,
	IT: IT,
	JE: JE,
	JM: JM,
	JO: JO,
	JP: JP,
	KE: KE,
	KG: KG,
	KH: KH,
	KI: KI,
	KM: KM,
	KN: KN,
	KP: KP,
	KR: KR,
	KW: KW,
	KY: KY,
	KZ: KZ,
	LA: LA,
	LB: LB,
	LC: LC,
	LI: LI,
	LK: LK,
	LR: LR,
	LS: LS,
	LT: LT,
	LU: LU,
	LV: LV,
	LY: LY,
	MA: MA,
	MC: MC,
	MD: MD,
	ME: ME,
	MF: MF,
	MG: MG,
	MH: MH,
	MK: MK,
	ML: ML,
	MM: MM,
	MN: MN,
	MO: MO,
	MP: MP,
	MQ: MQ,
	MR: MR,
	MS: MS,
	MT: MT,
	MU: MU,
	MV: MV,
	MW: MW,
	MX: MX,
	MY: MY,
	MZ: MZ,
	NA: NA,
	NC: NC,
	NE: NE,
	NF: NF,
	NG: NG,
	NI: NI,
	NL: NL,
	NO: NO,
	NP: NP,
	NR: NR,
	NU: NU,
	NZ: NZ,
	OM: OM,
	PA: PA,
	PE: PE,
	PF: PF,
	PG: PG,
	PH: PH,
	PK: PK,
	PL: PL,
	PM: PM,
	PN: PN,
	PR: PR,
	PS: PS,
	PT: PT,
	PW: PW,
	PY: PY,
	QA: QA,
	RE: RE,
	RO: RO,
	RS: RS,
	RU: RU,
	RW: RW,
	SA: SA,
	SB: SB,
	SC: SC,
	SD: SD,
	SE: SE,
	SG: SG,
	SH: SH,
	SI: SI,
	SJ: SJ,
	SK: SK,
	SL: SL,
	SM: SM,
	SN: SN,
	SO: SO,
	SR: SR,
	SS: SS,
	ST: ST,
	SV: SV,
	SX: SX,
	SY: SY,
	SZ: SZ,
	TC: TC,
	TD: TD,
	TF: TF,
	TG: TG,
	TH: TH,
	TJ: TJ,
	TK: TK,
	TL: TL,
	TM: TM,
	TN: TN,
	TO: TO,
	TR: TR,
	TT: TT,
	TV: TV,
	TW: TW,
	TZ: TZ,
	UA: UA,
	UG: UG,
	UM: UM,
	US: US,
	UY: UY,
	UZ: UZ,
	VA: VA,
	VC: VC,
	VE: VE,
	VG: VG,
	VI: VI,
	VN: VN,
	VU: VU,
	WF: WF,
	WS: WS,
	XC: XC,
	XK: XK,
	YE: YE,
	YT: YT,
	ZA: ZA,
	ZM: ZM,
	ZW: ZW
};

var countryNames$1 = /*#__PURE__*/Object.freeze({
  __proto__: null,
  AD: AD,
  AE: AE,
  AF: AF,
  AG: AG,
  AI: AI,
  AL: AL,
  AM: AM,
  AO: AO,
  AQ: AQ,
  AR: AR,
  AS: AS,
  AT: AT,
  AU: AU,
  AW: AW,
  AX: AX,
  AZ: AZ,
  BA: BA,
  BB: BB,
  BD: BD,
  BE: BE,
  BF: BF,
  BG: BG,
  BH: BH,
  BI: BI,
  BJ: BJ,
  BL: BL,
  BM: BM,
  BN: BN,
  BO: BO,
  BQ: BQ,
  BR: BR,
  BS: BS,
  BT: BT,
  BV: BV,
  BW: BW,
  BY: BY,
  BZ: BZ,
  CA: CA,
  CC: CC,
  CD: CD,
  CF: CF,
  CG: CG,
  CH: CH,
  CI: CI,
  CK: CK,
  CL: CL,
  CM: CM,
  CN: CN,
  CO: CO,
  CR: CR,
  CU: CU,
  CV: CV,
  CW: CW,
  CX: CX,
  CY: CY,
  CZ: CZ,
  DE: DE,
  DJ: DJ,
  DK: DK,
  DM: DM,
  DO: DO,
  DZ: DZ,
  EC: EC,
  EE: EE,
  EG: EG,
  EH: EH,
  ER: ER,
  ES: ES,
  ET: ET,
  FI: FI,
  FJ: FJ,
  FK: FK,
  FM: FM,
  FO: FO,
  FR: FR,
  GA: GA,
  GB: GB,
  GD: GD,
  GE: GE,
  GF: GF,
  GG: GG,
  GH: GH,
  GI: GI,
  GL: GL,
  GM: GM,
  GN: GN,
  GP: GP,
  GQ: GQ,
  GR: GR,
  GS: GS,
  GT: GT,
  GU: GU,
  GW: GW,
  GY: GY,
  HK: HK,
  HM: HM,
  HN: HN,
  HR: HR,
  HT: HT,
  HU: HU,
  ID: ID,
  IE: IE,
  IL: IL,
  IM: IM,
  IN: IN,
  IO: IO,
  IQ: IQ,
  IR: IR,
  IS: IS,
  IT: IT,
  JE: JE,
  JM: JM,
  JO: JO,
  JP: JP,
  KE: KE,
  KG: KG,
  KH: KH,
  KI: KI,
  KM: KM,
  KN: KN,
  KP: KP,
  KR: KR,
  KW: KW,
  KY: KY,
  KZ: KZ,
  LA: LA,
  LB: LB,
  LC: LC,
  LI: LI,
  LK: LK,
  LR: LR,
  LS: LS,
  LT: LT,
  LU: LU,
  LV: LV,
  LY: LY,
  MA: MA,
  MC: MC,
  MD: MD,
  ME: ME,
  MF: MF,
  MG: MG,
  MH: MH,
  MK: MK,
  ML: ML,
  MM: MM,
  MN: MN,
  MO: MO,
  MP: MP,
  MQ: MQ,
  MR: MR,
  MS: MS,
  MT: MT,
  MU: MU,
  MV: MV,
  MW: MW,
  MX: MX,
  MY: MY,
  MZ: MZ,
  NA: NA,
  NC: NC,
  NE: NE,
  NF: NF,
  NG: NG,
  NI: NI,
  NL: NL,
  NO: NO,
  NP: NP,
  NR: NR,
  NU: NU,
  NZ: NZ,
  OM: OM,
  PA: PA,
  PE: PE,
  PF: PF,
  PG: PG,
  PH: PH,
  PK: PK,
  PL: PL,
  PM: PM,
  PN: PN,
  PR: PR,
  PS: PS,
  PT: PT,
  PW: PW,
  PY: PY,
  QA: QA,
  RE: RE,
  RO: RO,
  RS: RS,
  RU: RU,
  RW: RW,
  SA: SA,
  SB: SB,
  SC: SC,
  SD: SD,
  SE: SE,
  SG: SG,
  SH: SH,
  SI: SI,
  SJ: SJ,
  SK: SK,
  SL: SL,
  SM: SM,
  SN: SN,
  SO: SO,
  SR: SR,
  SS: SS,
  ST: ST,
  SV: SV,
  SX: SX,
  SY: SY,
  SZ: SZ,
  TC: TC,
  TD: TD,
  TF: TF,
  TG: TG,
  TH: TH,
  TJ: TJ,
  TK: TK,
  TL: TL,
  TM: TM,
  TN: TN,
  TO: TO,
  TR: TR,
  TT: TT,
  TV: TV,
  TW: TW,
  TZ: TZ,
  UA: UA,
  UG: UG,
  UM: UM,
  US: US,
  UY: UY,
  UZ: UZ,
  VA: VA,
  VC: VC,
  VE: VE,
  VG: VG,
  VI: VI,
  VN: VN,
  VU: VU,
  WF: WF,
  WS: WS,
  XC: XC,
  XK: XK,
  YE: YE,
  YT: YT,
  ZA: ZA,
  ZM: ZM,
  ZW: ZW,
  default: countryNames
});

var addressFormatter = {
  format: function format(input) {
    var options = arguments.length > 1 && arguments[1] !== undefined ? arguments[1] : {
      abbreviate: false,
      appendCountry: false,
      cleanupPostcode: true,
      countryCode: undefined,
      fallbackCountryCode: undefined,
      output: 'string'
    };
    var realInput = Object.assign({}, input);
    realInput = normalizeComponentKeys(realInput);
    if (options.countryCode) {
      // eslint-disable-next-line camelcase
      realInput.country_code = options.countryCode;
    }
    realInput = determineCountryCode(realInput, options.fallbackCountryCode);
    if (options.appendCountry && countryNames$1[realInput.country_code] && !realInput.country) {
      realInput.country = countryNames$1[realInput.country_code];
    }
    realInput = applyAliases(realInput);
    var template = findTemplate(realInput);
    realInput = cleanupInput(realInput, template.replace, options);
    var result = renderTemplate(template, realInput);
    if (options.output === 'array') {
      return result.split('\n').filter(function (f) {
        return !!f;
      });
    }
    return result;
  }
};

module.exports = addressFormatter;
