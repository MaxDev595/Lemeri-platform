import { extname } from "node:path";
// Parsers are loaded only for the file type being processed. PDF text is
// extracted in the browser (pdf.js is ~2 MB and does not fit the Cloudflare
// Worker size limit), so for PDFs the caller passes the extracted text.
const allowed=new Set([".pdf",".docx",".txt",".csv",".xlsx"]);
export const MAX_KNOWLEDGE_FILE_BYTES=10*1024*1024;

export async function extractDocumentText(name:string,buffer:Buffer,clientText?:string|null){
  const extension=extname(name).toLowerCase();
  if(!allowed.has(extension))throw new Error("UNSUPPORTED_DOCUMENT_TYPE");
  if(!buffer.length||buffer.length>MAX_KNOWLEDGE_FILE_BYTES)throw new Error("INVALID_DOCUMENT_SIZE");
  let text="";
  if(extension===".pdf"){
    if(!clientText)throw new Error("PDF_TEXT_REQUIRED");
    text=clientText;
  }else if(extension===".docx"){
    const { default: mammoth }=await import("mammoth");
    text=(await mammoth.extractRawText({buffer})).value;
  }else if(extension===".xlsx"){
    const { default: readXlsxFile }=await import("read-excel-file/node");
    const sheets=await readXlsxFile(buffer);
    text=sheets.map(sheet=>`# ${sheet.sheet}\n${sheet.data.map(row=>row.map(cell=>cell==null?"":String(cell)).join("\t")).join("\n")}`).join("\n\n");
  }else{
    text=new TextDecoder("utf-8",{fatal:false}).decode(buffer);
  }
  const cleaned=text.replace(/\0/g,"").replace(/[ \t]+\n/g,"\n").trim();
  if(cleaned.length<10)throw new Error("DOCUMENT_HAS_NO_TEXT");
  return cleaned.slice(0,2_000_000);
}
