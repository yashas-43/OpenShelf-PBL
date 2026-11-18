import test from 'node:test';
import assert from 'node:assert/strict';
import { classifySubjectPdfBundle } from '../services/subjectPdfBundle.js';

const pdf = (partNumber, rightsConfirmed = true) => ({ partNumber, rightsConfirmed, isActive: true });
test('a complete approved PDF is saleable as one subject', () => {
  const b = classifySubjectPdfBundle([pdf(null)]);
  assert.equal(b.ready, true);
  assert.equal(b.parts.length, 1);
});
test('two authorised PDF parts are sold as one subject, in numeric order', () => {
  const a=pdf(1), b=pdf(2);
  const bundle=classifySubjectPdfBundle([b,a]);
  assert.equal(bundle.ready, true);
  assert.deepEqual(bundle.parts,[a,b]);
});
test('cannot sell missing, unapproved, duplicate or incomplete parts', () => {
  assert.equal(classifySubjectPdfBundle([]).status,'not_uploaded');
  assert.equal(classifySubjectPdfBundle([pdf(1)]).status,'incomplete_parts');
  assert.equal(classifySubjectPdfBundle([pdf(2)]).status,'incomplete_parts');
  assert.equal(classifySubjectPdfBundle([pdf(1),pdf(1)]).status,'incomplete_parts');
  assert.equal(classifySubjectPdfBundle([pdf(1),pdf(2,false)]).status,'not_approved');
  assert.equal(classifySubjectPdfBundle([pdf(null),pdf(null)]).status,'incomplete_parts');
  assert.equal(classifySubjectPdfBundle([pdf(null,false)]).status,'not_approved');
});
test('inactive PDFs are never counted as available', () => {
  const b=classifySubjectPdfBundle([{...pdf(1),isActive:false}, pdf(2)]);
  assert.equal(b.ready,false);
});
