import { unlink } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import Book from '../models/Book.js';
import StudentTextbook from '../models/StudentTextbook.js';
import StudentPDF from '../models/StudentPDF.js';
import AdminAudit from '../models/AdminAudit.js';
import { adminInputError, objectIdOrError } from '../validators/adminValidation.js';
import { writeManagedPdf, writeCover } from '../services/adminUploads.js';

const partNumber = (value) => {
  if (value === undefined || value === '' || value === null) return null;
  if (value === '1' || value === '2') return Number(value);
  throw adminInputError('Part number must be 1, 2, or blank.');
};
const displayTitle = (value, fallback) => {
  const title = String(value || fallback).trim();
  if (!title || title.length > 250) throw adminInputError('PDF title must be between 1 and 250 characters.');
  return title;
};

export async function addPdf(req,res,next) {
  let saved = null;
  try {
    objectIdOrError(req.params.id);
    const textbook = await StudentTextbook.findById(req.params.id).lean();
    if (!textbook) throw adminInputError('Student textbook group not found.',404);
    if (!req.file) throw adminInputError('Choose a PDF file.');
    const title = displayTitle(req.body?.displayTitle, req.file.originalname);
    const part = partNumber(req.body?.partNumber);
    saved = await writeManagedPdf(req.file.buffer);
    const pdf = await StudentPDF.create({ textbook:textbook._id, relativePath:saved.relativePath,
      filename: saved.filename, displayTitle:title, partNumber:part, sizeBytes:saved.sizeBytes,
      rightsConfirmed:false, source:'admin', importBatch:`admin:${randomUUID()}`, isActive:true });
    saved = null; // Database now points to this file: never delete it on an audit failure.
    await AdminAudit.create({action:'student_pdf_uploaded',targetType:'pdf',targetId:String(pdf._id)}).catch(console.error);
    res.status(201).json({success:true,data:pdf,message:'PDF uploaded privately. Rights must be confirmed before production publication.'});
  }catch(error){if(saved)await unlink(saved.absolutePath).catch(()=>{});next(error);}
}

export async function replacePdf(req,res,next) {
  let saved = null;
  try {
    objectIdOrError(req.params.id);
    const old = await StudentPDF.findById(req.params.id);
    if (!old) throw adminInputError('PDF not found.',404);
    if (!req.file) throw adminInputError('Choose a replacement PDF file.');
    const title = displayTitle(req.body?.displayTitle, old.displayTitle || req.file.originalname);
    saved = await writeManagedPdf(req.file.buffer);
    // Reusing the document ID preserves references and reading positions.
    // Rights are revoked on replacement; replacing never implicitly grants rights.
    old.relativePath=saved.relativePath;
    old.filename=saved.filename;
    old.displayTitle=title;
    old.sizeBytes=saved.sizeBytes;
    old.source='admin';
    old.rightsConfirmed=false;
    old.isActive=true;
    old.importBatch=`admin:${randomUUID()}`;
    await old.save();
    saved = null; // Replacement was committed; do not destroy the new file.
    await AdminAudit.create({action:'student_pdf_replaced',targetType:'pdf',targetId:String(old._id)}).catch(console.error);
    res.json({success:true,data:old,message:'PDF replaced. Confirm rights again before production distribution.'});
    // Do not delete old local-source files or any originals. Old managed files can be cleaned separately.
  }catch(error){if(saved)await unlink(saved.absolutePath).catch(()=>{});next(error);}
}

export async function uploadBookCover(req,res,next) {
  try {
    objectIdOrError(req.params.id);
    const book = await Book.findOne({_id:req.params.id,format:'physical'});
    if (!book) throw adminInputError('General Book not found.',404);
    if (!req.file) throw adminInputError('Choose a cover image.');
    const cover = await writeCover(req.file.buffer,String(book._id));
    book.coverFileExtension = cover.extension;
    book.coverUrl = `/api/books/${book._id}/cover`;
    await book.save();
    await AdminAudit.create({action:'book_cover_uploaded',targetType:'book',targetId:String(book._id)}).catch(console.error);
    res.json({success:true,message:'Cover uploaded.',data:{coverUrl:book.coverUrl}});
  }catch(error){next(error);}
}
