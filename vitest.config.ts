import { defineVitestConfig } from '@papercusp/test-config';

// Unit layer: *.test.ts, excludes *.integration.test.ts.
export default defineVitestConfig({ layer: 'unit' });
