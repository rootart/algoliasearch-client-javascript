const test = require('tape');

test('When not using custom hosts, active hosts state is shared amongst client instantiations', t => {
  const fauxJax = require('faux-jax');
  const parse = require('url-parse');
  fauxJax.install({ gzip: true });

  const createFixture = require('../../../utils/create-fixture');
  const fixture = createFixture();
  const fixture2 = createFixture({
    credentials: fixture.credentials,
  });
  const fixture3 = createFixture({
    credentials: fixture.credentials,
  });

  const credentials = fixture.credentials;
  const failingHost = `${credentials.applicationID.toLowerCase()}-dsn.algolia.net`;
  let workingHost;
  const firstClientIndex = fixture.index;
  const secondClientIndex = fixture2.index;
  const thirdClientIndex = fixture3.index;

  const reqHandlers = [
    function(req) {
      t.equal(
        parse(req.requestURL).hostname,
        failingHost,
        `First client, first search, first request done on ${failingHost}`
      );

      // simulate network error
      req.respond(500, {}, JSON.stringify({ message: 'Woopsie', status: 500 }));
    },
    function(req) {
      workingHost = parse(req.requestURL).hostname;
      t.notEqual(
        workingHost,
        failingHost,
        `First client, first search, second request not done on ${failingHost}`
      );
      req.respond(
        200,
        {},
        JSON.stringify({
          message: 'First client, first search, second request',
        })
      );
    },
    function(req) {
      t.equal(
        parse(req.requestURL).hostname,
        workingHost,
        `Second client, first search, first request done on ${workingHost}`
      );
      req.respond(
        200,
        {},
        JSON.stringify({
          message: 'Second client, first search, first request',
        })
      );
    },
    function(req) {
      // after RESET_APP_DATA_TIMER, we should try again the failing host
      t.equal(
        parse(req.requestURL).hostname,
        failingHost,
        `Third client, first search, first request done on ${failingHost}`
      );
      req.respond(
        200,
        {},
        JSON.stringify({ message: 'Third client, first search, first request' })
      );
    },
  ];

  let reqCount = 1;
  fauxJax.on('request', req => {
    if (reqCount > 4) {
      t.fail('Received more requests than planned');
    }
    reqHandlers[reqCount - 1](req);
    reqCount++;
  });

  firstSearch();

  function firstSearch() {
    firstClientIndex.search('one', (err, res) => {
      t.error(err, 'No error on first search');
      t.deepEqual(
        res,
        {
          message: 'First client, first search, second request',
        },
        'First client, first search receives right message'
      );
      secondSearch();
    });
  }

  function secondSearch() {
    secondClientIndex.search('two', (err, res) => {
      t.error(err, 'No error on second search');
      t.deepEqual(
        res,
        {
          message: 'Second client, first search, first request',
        },
        'Second client, first search receives right message'
      );
      setTimeout(thirdSearch, parseInt(process.env.RESET_APP_DATA_TIMER, 10));
    });
  }

  function thirdSearch() {
    thirdClientIndex.search('three', (err, res) => {
      t.error(err, 'No error on third search');
      t.deepEqual(
        res,
        {
          message: 'Third client, first search, first request',
        },
        'Third client, first search receives right message'
      );
      fauxJax.restore();
      t.end();
    });
  }
});
