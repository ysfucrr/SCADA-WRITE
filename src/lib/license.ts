import { machineIdSync } from 'node-machine-id';

export function isLicenseValid(license: any): boolean {
  const currentMachineId = machineIdSync(true);
  const now = Date.now();

  return (
    license &&
    license.machineId === currentMachineId &&
    new Date(license.expireAt).getTime() > now
  );
}