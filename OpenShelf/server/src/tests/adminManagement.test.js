import test from 'node:test';
import assert from 'node:assert/strict';
import { GENERAL_GENRES, validateBookUpdate, inventoryFromActiveLoans, listOptions, boundedSearch, escapeRegex } from '../validators/adminValidation.js';
import { looksLikePdf, coverExtension, MAX_ADMIN_UPLOAD } from '../services/adminUploads.js';

test('all 32 required genres are available with correct names',()=>{
  assert.equal(GENERAL_GENRES.length,32);
  assert.equal(new Set(GENERAL_GENRES).size,32);
  assert.ok(GENERAL_GENRES.includes('Religion and Spirituality'));
  assert.ok(GENERAL_GENRES.includes('Computer Science'));
  assert.ok(!GENERAL_GENRES.includes('Literary Fiction'));
});
test('book CRUD rejects PDF fields and rejects non-approved genres',()=>{
  assert.throws(()=>validateBookUpdate({pdfUrl:'https://example.com/file.pdf'}),/pdfUrl cannot/);
  assert.throws(()=>validateBookUpdate({genre:'Drama'}),/32 approved/);
  assert.throws(()=>validateBookUpdate({format:'pdf'}),/format cannot/);
  assert.throws(()=>validateBookUpdate({title:'A',author:'B',genre:'Fiction',description:'D',coverUrl:'http://example.com/cover.jpg'}, {creating:true}),/HTTPS/);
});
test('book creation and update accept validated fields only',()=>{
  assert.deepEqual(validateBookUpdate({title:'Book',author:'Writer',genre:'Fiction',description:'A real book',totalCopies:3},{creating:true}),
    {title:'Book',author:'Writer',genre:'Fiction',description:'A real book',totalCopies:3});
  assert.deepEqual(validateBookUpdate({isPublished:false}),{isPublished:false});
  assert.throws(()=>validateBookUpdate({totalCopies:-1}),/Total copies/);
});
test('inventory calculation protects all active loans',()=>{
  assert.deepEqual(inventoryFromActiveLoans(3,2),{totalCopies:3,availableCopies:1});
  assert.deepEqual(inventoryFromActiveLoans(0,0),{totalCopies:0,availableCopies:0});
  assert.throws(()=>inventoryFromActiveLoans(1,2),/existing active loan/);
  assert.throws(()=>inventoryFromActiveLoans(2.5,0),/Total copies/);
});
test('admin search and pagination are bounded and regex escaped',()=>{
  assert.deepEqual(listOptions({page:'-10',limit:'9000'}),{page:1,limit:40,skip:0});
  assert.deepEqual(listOptions({page:'2',limit:'10'}),{page:2,limit:10,skip:10});
  assert.equal(escapeRegex('a.*?'), 'a\\.\\*\\?');
  assert.equal(boundedSearch('x'.repeat(120)).length,80);
});
test('file validation checks actual bytes rather than extension',()=>{
  assert.equal(looksLikePdf(Buffer.from('%PDF-1.7\n')),true);
  assert.equal(looksLikePdf(Buffer.from('<script>')),false);
  assert.equal(looksLikePdf(Buffer.alloc(0)),false);
  assert.equal(MAX_ADMIN_UPLOAD,30*1024*1024);
  assert.equal(coverExtension(Buffer.from([255,216,255,0,0])),'jpg');
  assert.equal(coverExtension(Buffer.from('not an image')),null);
});
