import test from 'node:test';
import assert from 'node:assert/strict';
import { cleanText, validateListing, publicListing, gmailComposeUrl, canMessage, mayChangeListingStatus, OBJECT_ID_PATTERN } from '../services/peerExchangeRules.js';
import { inspectPeerPhoto } from '../services/peerPhotos.js';
const valid = { title:'A Real Book', author:'A Real Author', description:'A physical book from my shelf', category:'Fiction', condition:'good', exchangeType:'lend', contactConsent:false };
test('valid peer book listing is normalized', () => assert.deepEqual(validateListing({...valid,title:'  A Real Book  '}),valid));
test('requires explicit owner contact consent boolean', () => assert.equal(validateListing({...valid,contactConsent:'true'}),null));
test('rejects PDF as peer listing photo and as content', () => assert.equal(inspectPeerPhoto(Buffer.from('%PDF-not-an-image')),null));
test('accepts real JPEG signature', () => assert.equal(inspectPeerPhoto(Buffer.from([0xff,0xd8,0xff,0x12,0,0,0,0,0,0,0,0])), 'jpg'));
test('rejects invalid listing types and conditions', () => { assert.equal(validateListing({...valid,condition:'mint'}),null);assert.equal(validateListing({...valid,exchangeType:'purchase'}),null); });
test('requires title, author and description', () => { assert.equal(validateListing({...valid,title:''}),null);assert.equal(validateListing({...valid,description:''}),null); });
test('bounds display strings and chat texts', () => { assert.equal(cleanText('x'.repeat(1001),1000),null);assert.equal(cleanText('  hello  ',100),'hello'); });
test('public listing does not expose email or opt-in consent', () => {
  const listing=publicListing({_id:'507f191e810c19729de860ea',title:'Book',author:'Author',description:'A book',category:'General',condition:'new',exchangeType:'exchange',contactConsent:true,photoExtension:'',status:'available',owner:{fullName:'Reader',email:'private@gmail.com'},createdAt:new Date()});
  assert.equal(listing.ownerName,'Reader');assert.equal('email' in listing,false);assert.equal('contactConsent' in listing,false);assert.equal(JSON.stringify(listing).includes('private@gmail.com'),false);
});
test('compose URL includes recipient and editable subject/message', () => {
  const url=gmailComposeUrl({email:'owner@example.com',title:'Title & Pages'});
  const parsed = new URL(url);
  assert.equal(parsed.searchParams.get('to'),'owner@example.com');
  assert.match(parsed.searchParams.get('su'),/Title & Pages/);
  assert.match(parsed.searchParams.get('body'),/Title & Pages/);
});
test('messages are possible only while request is active', () => {
  assert.equal(canMessage('pending'),true);assert.equal(canMessage('accepted'),true);assert.equal(canMessage('rejected'),false);assert.equal(canMessage('completed'),false);
});
test('reserved and removed listings cannot be relisted directly', () => {
  assert.equal(mayChangeListingStatus('reserved','available'),false);assert.equal(mayChangeListingStatus('removed','available'),false);
  assert.equal(mayChangeListingStatus('unavailable','available'),true);assert.equal(mayChangeListingStatus('available','exchanged'),true);
});
test('valid ObjectId pattern only',()=>{assert.equal(OBJECT_ID_PATTERN.test('507f191e810c19729de860ea'),true);assert.equal(OBJECT_ID_PATTERN.test('../config'),false)});
