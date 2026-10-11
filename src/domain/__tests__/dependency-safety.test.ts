const { quote } = jest.requireActual<{ quote: (tokens: (string | { comment: string })[]) => string }>('shell-quote');
describe('compatible developer-tool quoting remediation', () => {
  test.each(['\n', '\r', '\u2028', '\u2029'])('rejects line terminator following a comment %j', terminator => {
    expect(() => quote([{ comment: 'fictional comment' }, `${terminator}fictional;echo denied`])).toThrow();
  });
  test('ordinary quoting retains safe argument boundaries', () => {
    expect(quote(['fictional path', 'semi;colon'])).toBe("'fictional path' semi\\;colon");
  });
});

const { SourceMapConsumer, SourceNode } = jest.requireActual<{
  SourceMapConsumer: new (map: object) => object;
  SourceNode: { fromStringWithSourceMap(code: string, consumer: object): { toString(): string } };
}>('source-map-js');
function indexedMap(line: number): object {
  return { version: 3, sections: [{ offset: { line, column: 0 }, map: { version: 3, sources: ['fictional.js'], names: [], mappings: 'AAAA', sourcesContent: ['fictional();'] } }] };
}
describe('compatible source-map patch regression', () => {
  test.each([1e12, Infinity, NaN, -1, 0.5])('rejects unsafe indexed line offset %j', line => {
    expect(() => new SourceMapConsumer(indexedMap(line))).toThrow();
  });
  test('ordinary indexed source map preserves code', () => {
    expect(SourceNode.fromStringWithSourceMap('fictional();', new SourceMapConsumer(indexedMap(0))).toString()).toBe('fictional();');
  });
});
