import type { NewKey, ChangedKey } from './types.js';

export async function promptNewKeys(newKeys: NewKey[]): Promise<NewKey[]> {
  const { default: inquirer } = await import('inquirer');
  const accepted: NewKey[] = [];

  for (const entry of newKeys) {
    const { confirm } = await inquirer.prompt([{
      type: 'confirm',
      name: 'confirm',
      message: `Add ${entry.key}=${entry.value}?`,
      default: true,
    }]);
    if (confirm) accepted.push(entry);
  }

  return accepted;
}

export async function promptChangedKeys(changedKeys: ChangedKey[]): Promise<ChangedKey[]> {
  const { default: inquirer } = await import('inquirer');
  const accepted: ChangedKey[] = [];

  for (const entry of changedKeys) {
    console.log(`  current: ${entry.currentValue}`);
    console.log(`  new:     ${entry.newValue}`);
    const { confirm } = await inquirer.prompt([{
      type: 'confirm',
      name: 'confirm',
      message: `Overwrite ${entry.key}?`,
      default: false,
    }]);
    if (confirm) accepted.push(entry);
  }

  return accepted;
}
