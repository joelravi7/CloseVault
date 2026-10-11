const { quote } = jest.requireActual<{ quote: (tokens: (string | { comment: string })[]) => string }>('shell-quote');
describe('compatible developer-tool quoting remediation', () => {
  test.each(['\n', '\r', '\u2028', '\u2029'])('rejects line terminator following a comment %j', terminator => {
    expect(() => quote([{ comment: 'fictional comment' }, `${terminator}fictional;echo denied`])).toThrow();
  });
  test('ordinary quoting retains safe argument boundaries', () => {
    expect(quote(['fictional path', 'semi;colon'])).toBe("'fictional path' semi\\;colon");
  });
});
