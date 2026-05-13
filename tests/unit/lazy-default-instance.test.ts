describe('lazy default-instance initialization', () => {
  let originalConstructor: typeof import('../../src/core/RobustAxiosClient').RobustAxiosClient;
  let constructionCount: number;

  beforeAll(() => {
    jest.isolateModules(() => {
      constructionCount = 0;
      // Patch the constructor before the index module loads, so we can
      // observe whether importing the package builds a client.
      jest.doMock('../../src/core/RobustAxiosClient', () => {
        const actual = jest.requireActual('../../src/core/RobustAxiosClient');
        originalConstructor = actual.RobustAxiosClient;
        class Counting extends originalConstructor {
          constructor(...args: ConstructorParameters<typeof originalConstructor>) {
            constructionCount++;
            super(...args);
          }
        }
        return { ...actual, RobustAxiosClient: Counting };
      });

      // Importing should not construct anything.
      require('../../src');
      expect(constructionCount).toBe(0);

      // First call to a static HTTP method triggers lazy construction.
      const factory = require('../../src').default;
      factory.getDefaultInstance(); // exercise the lazy path directly
      expect(constructionCount).toBe(1);

      // Subsequent calls reuse the same instance.
      factory.getDefaultInstance();
      expect(constructionCount).toBe(1);

      factory._resetForTesting();
    });
  });

  it('did not construct a client at import time', () => {
    // The assertions live in beforeAll because they run inside the
    // isolateModules sandbox. Reaching here means they all passed.
    expect(true).toBe(true);
  });
});
