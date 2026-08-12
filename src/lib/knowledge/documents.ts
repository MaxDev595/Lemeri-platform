import { extname } from "node:path";
import { PDFParse } from "pdf-parse";
import mammoth from "mammoth";
import readXlsxFile from "read-excel-file/node";

const allowed=new Set([".pdf",".docx",".txt",".csv",".xlsx"]);
export const MAX_KNOWLEDGE_FILE_BYTES=10*1024*1024;

export async function extractDocumentText(name:string,buffer:Buffer){
  const extension=extname(name).toLowerCase();
  if(!allowed.has(extension))throw new Error("UNSUPPORTED_DOCUMENT_TYPE");
  if(!buffer.length||buffer.length>MAX_KNOWLEDGE_FILE_BYTES)throw new Error("INVALID_DOCUMENT_SIZE");
  let text="";
  if(extension===".pdf"){
    const parser=new PDFParse({data:new Uint8Array(buffer)});
    try{text=(await parser.getText()).text}finally{await parser.destroy()}
  }else if(extension===".docx"){
    text=(await mammoth.extractRawText({buffer})).value;
  }else if(extension===".xlsx"){
    const sheets=await readXlsxFile(buffer);
    text=sheets.map(sheet=>`# ${sheet.sheet}\n${sheet.data.map(row=>row.map(cell=>cell==null?"":String(cell)).join("\t")).join("\n")}`).join("\n\n");
  }else{
    text=new TextDecoder("utf-8",{fatal:false}).decode(buffer);
  }
  const cleaned=text.replace(/\0/g,"").replace(/[ \t]+\n/g,"\n").trim();
  if(cleaned.length<10)throw new Error("DOCUMENT_HAS_NO_TEXT");
  return cleaned.slice(0,2_000_000);
}
