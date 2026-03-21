import { Document, Packer, Paragraph, TextRun, ImageRun, AlignmentType, HeadingLevel } from 'docx';
import FileSaver from 'file-saver';
import { ProcessedPage, ContentType } from '../types';

export const generateAndSaveWordDoc = async (
  processedPages: ProcessedPage[], 
  fileName: string
) => {
  const children: (Paragraph)[] = [];

  processedPages.forEach((page) => {
    page.blocks.forEach((block) => {
      if (block.type === ContentType.TEXT && block.text) {
        // Ensure options A. B. C. D. are on new lines even if AI put them inline
        // Regex looks for " B. " or " C. " and replaces with "\nB. "
        const formattedText = block.text.replace(/(\s)([A-D]\.\s)/g, '\n$2');

        const lines = formattedText.split('\n');
        lines.forEach(line => {
          const trimmed = line.trim();
          if (!trimmed) return;

          let paragraph;

          if (trimmed.startsWith('# ')) {
             paragraph = new Paragraph({
              text: trimmed.replace('# ', ''),
              heading: HeadingLevel.HEADING_1,
              spacing: { after: 120 }
            });
          } else if (trimmed.startsWith('## ')) {
            paragraph = new Paragraph({
              text: trimmed.replace('## ', ''),
              heading: HeadingLevel.HEADING_2,
              spacing: { after: 100 }
            });
          } else if (trimmed.startsWith('$$') && trimmed.endsWith('$$')) {
            // Handle Block LaTeX Math
            paragraph = new Paragraph({
              children: [new TextRun({
                text: trimmed,
                font: "Courier New",
                size: 22,
              })],
              alignment: AlignmentType.CENTER,
              spacing: { before: 120, after: 120 }
            });
          } else if (/^[A-D]\.\s/.test(trimmed)) {
            // Handle Multiple Choice Options (A. B. C. D.)
            // Indent them slightly for better readability
            paragraph = new Paragraph({
              children: [new TextRun(trimmed)],
              spacing: { after: 60 },
              indent: { left: 720, hanging: 360 } // ~0.5 inch indent
            });
          } else if (trimmed.startsWith('- ') || trimmed.startsWith('* ')) {
             paragraph = new Paragraph({
              children: [new TextRun(trimmed.replace(/^[-*] /, ''))],
              bullet: { level: 0 }
            });
          } else {
            // Regular text
            paragraph = new Paragraph({
              children: [new TextRun(trimmed)],
              spacing: { after: 200 }
            });
          }
          children.push(paragraph);
        });
      } else if (block.type === ContentType.IMAGE && block.imageData) {
        try {
           const imageString = block.imageData.replace(/^data:image\/(png|jpeg);base64,/, "");
           const imageBuffer = Uint8Array.from(atob(imageString), c => c.charCodeAt(0));

           const imageParagraph = new Paragraph({
             children: [
               new ImageRun({
                 data: imageBuffer,
                 transformation: {
                   width: block.width || 400,
                   height: block.height || 300,
                 },
                 type: "png",
               } as any),
             ],
             alignment: AlignmentType.CENTER,
             spacing: { before: 200, after: 200 }
           });
           children.push(imageParagraph);
        } catch (e) {
          console.error("Error adding image to doc:", e);
          children.push(new Paragraph({ text: "[ERROR INSERTING IMAGE]" }));
        }
      }
    });
    
    // Add a spacer between pages
    children.push(new Paragraph({ text: "" })); 
  });

  const doc = new Document({
    sections: [
      {
        properties: {},
        children: children,
      },
    ],
  });

  const blob = await Packer.toBlob(doc);
  
  const saveAs = (FileSaver as any).saveAs || FileSaver;
  saveAs(blob, `${fileName.replace('.pdf', '')}_converted.docx`);
};