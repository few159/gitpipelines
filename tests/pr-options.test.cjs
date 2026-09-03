const assert = require('node:assert/strict');
const { test } = require('node:test');
const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');

// Run the real command code without launching an editor or contacting Azure.
function loadSource(name, dependencies) {
  const filename = path.resolve(__dirname, '../src', `${name}.ts`);
  const code = ts.transpileModule(fs.readFileSync(filename, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 }
  }).outputText;
  const module = { exports: {} };
  const localRequire = (id) => {
    if (Object.hasOwn(dependencies, id)) { return dependencies[id]; }
    if (id.startsWith('./')) { return loadSource(id.slice(2), dependencies); }
    return require(id);
  };
  new Function('require', 'module', 'exports', code)(localRequire, module, module.exports);
  return module.exports;
}

async function runCommand({ single = false, branch = 'feat/123456-description', input = '123456', flag } = {}) {
  let prompt;
  let runOptions;
  let additionalCalls = 0;
  const pipeline = {
    id: 'test', name: 'Test', org: 'org', project: 'project', repo: 'repo',
    targetBranches: [{ name: 'main' }], createdAt: '2026-09-03', askForAdditionalPr: flag
  };
  const vscode = { window: {
    showQuickPick: async () => single ? ['main'] : { pipeline },
    showInputBox: async (options) => { prompt = options; return input; }
  } };
  const dependencies = {
    vscode,
    './storage': {
      pickWorkspaceFolder: async () => ({ name: 'test' }),
      ensurePat: async () => 'test-pat',
      readPipelineStore: async () => ({ pipelines: [pipeline] })
    },
    './git': {
      getCurrentBranch: async () => branch, isBranchPublished: async () => true,
      getLastCommitMessage: async () => 'message', getOriginUrl: async () => 'remote',
      parseAzureRemoteUrl: () => ({ org: 'org', project: 'project', repo: 'repo' })
    },
    './azureDevops': { fetchBranches: async () => ['main'] },
    './branchPrompts': { promptTemporaryBranches: async () => [{ name: 'main' }] },
    './pipelineRunner': {
      runPipeline: async (options) => { runOptions = options; return []; },
      promptAdditionalBranchPr: async () => { additionalCalls++; },
      showResults: async () => {}
    }
  };
  const command = single ? 'singlePipeline' : 'usePipeline';
  await loadSource(command, dependencies)[`${command}Command`]({ secrets: {} }, {})();
  return { prompt, runOptions, additionalCalls };
}

for (const single of [false, true]) {
  const label = single ? 'single' : 'saved';
  test(`${label}: suggests the branch work item`, async () => {
    assert.equal((await runCommand({ single })).prompt.value, '123456');
  });
  for (const branch of ['fix/654321-bug', 'chore/654321-cleanup', 'custom-prefix/654321-description']) {
    test(`${label}: suggests the work item with any prefix (${branch})`, async () => {
      assert.equal((await runCommand({ single, branch })).prompt.value, '654321');
    });
  }
  test(`${label}: leaves unmatched branches blank`, async () => {
    for (const branch of ['main', 'feat/no-id', 'feat/description-123456', 'fix/description-123456', '123456-description', '/123456-description', 'fix/123abc-description']) {
      assert.equal((await runCommand({ single, branch })).prompt.value, '');
    }
  });
  test(`${label}: parses comma-separated IDs and removes duplicates`, async () => {
    const result = await runCommand({ single, input: '123456, 654321, 321456, 123456' });
    assert.deepEqual(result.runOptions.workItemIds, [123456, 654321, 321456]);
    assert.equal(result.prompt.validateInput('123456, 654321, 321456'), null);
  });
  test(`${label}: rejects malformed IDs`, async () => {
    const { prompt } = await runCommand({ single });
    for (const value of ['123,', ',123', '123,,456', 'abc', '1.2', '-1', '0', '9007199254740992']) {
      assert.ok(prompt.validateInput(value), `Should reject ${value}`);
    }
  });
  test(`${label}: clearing suggestion links no items`, async () => {
    const result = await runCommand({ single, input: '   ' });
    assert.equal(result.runOptions.workItemIds, undefined);
    assert.equal(result.prompt.validateInput('   '), null);
  });
}

for (const flag of [undefined, false, true, 'true']) {
  test(`saved: additional PR prompt requires literal true (${String(flag)})`, async () => {
    assert.equal((await runCommand({ flag })).additionalCalls, flag === true ? 1 : 0);
  });
}
test('single: does not ask for an additional PR', async () => {
  assert.equal((await runCommand({ single: true })).additionalCalls, 0);
});

test('new pipelines persist the additional PR flag as false', async () => {
  let saved;
  const dependencies = {
    vscode: { window: {
      showInputBox: async () => 'test',
      showQuickPick: async () => ['main'],
      showInformationMessage: () => {}
    } },
    './storage': {
      pickWorkspaceFolder: async () => ({}), ensurePat: async () => 'pat',
      addPipeline: async (_folder, pipeline) => { saved = pipeline; }
    },
    './git': { getOriginUrl: async () => 'remote', parseAzureRemoteUrl: () => ({}) },
    './azureDevops': { fetchBranches: async () => ['main'] },
    './branchPrompts': { promptTemporaryBranches: async () => [{ name: 'main' }] }
  };
  await loadSource('createPipeline', dependencies).createPipelineCommand(
    { secrets: {} }, { appendLine: () => {} }
  )();
  assert.equal(saved.askForAdditionalPr, false);
});

for (const flag of [undefined, false, true]) {
  test(`updating a pipeline preserves additional PR setting (${String(flag)})`, async () => {
    const pipeline = {
      id: 'test', name: 'Test', org: 'org', project: 'project', repo: 'repo',
      targetBranches: [{ name: 'main' }], createdAt: '2026-09-03', askForAdditionalPr: flag
    };
    let saved;
    const dependencies = {
      vscode: { window: {
        showQuickPick: async (_items, options) => options.title === 'Select a pipeline to update'
          ? { pipeline } : { target: false },
        showInputBox: async (options) => options.value,
        showInformationMessage: () => {}
      } },
      './storage': {
        pickWorkspaceFolder: async () => ({}),
        readPipelineStore: async () => ({ pipelines: [pipeline] }),
        updatePipeline: async (_folder, updated) => { saved = updated; }
      },
      './azureDevops': {}, './branchPrompts': {}
    };
    await loadSource('updatePipeline', dependencies).updatePipelineCommand(
      { secrets: {} }, { appendLine: () => {} }
    )();
    assert.equal(saved.askForAdditionalPr, flag);
  });
}
