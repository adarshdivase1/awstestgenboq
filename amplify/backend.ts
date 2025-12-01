import { defineBackend } from '@aws-amplify/backend';
import { auth } from './auth/resource';
import { data } from './data/resource';
import { generateBoqFunction } from './functions/generate-boq/resource';

defineBackend({
  auth,
  data,
  generateBoqFunction,
});