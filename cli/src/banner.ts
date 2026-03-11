import chalk from 'chalk';

// Snoopy art removed per request. Only text animation remains.

// SNOOP big text (figlet "ANSI Shadow" style")
const snoopText = [
  ` ███████╗███╗   ██╗ ██████╗  ██████╗ ██████╗ `,
  ` ██╔════╝████╗  ██║██╔═══██╗██╔═══██╗██╔══██╗`,
  ` ███████╗██╔██╗ ██║██║   ██║██║   ██║██████╔╝`,
  ` ╚════██║██║╚████║██║   ██║██║   ██║██╔═══╝ `,
  ` ███████║██║ ╚███║╚██████╔╝╚██████╔╝██║     `,
  ` ╚══════╝╚═╝  ╚══╝ ╚═════╝  ╚═════╝╚═╝     `,
];

const tagline = `  🔍 explains packages before you install them`;


// Color themes cycling across frames for the text sweep
const colors = [
  chalk.hex('#58a6ff'), // blue
  chalk.hex('#79c0ff'), // lighter blue
  chalk.hex('#a5d6ff'), // pale blue
  chalk.hex('#cae8ff'), // near-white blue
  chalk.hex('#79c0ff'), // back
  chalk.hex('#58a6ff'),
];

function colorSweep(lines: string[], frame: number): string[] {
  return lines.map((line, lineIdx) =>
    line
      .split('')
      .map((char, charIdx) => {
        const colorIdx = (charIdx + lineIdx + frame) % colors.length;
        return colors[colorIdx](char);
      })
      .join('')
  );
}

function renderFrame(frame: number, totalFrames: number): string {
  const progress = frame / totalFrames;

  // SNOOP text sweeps in from left
  const textVisibleChars = Math.floor(
    progress * 2 * (snoopText[0]?.length ?? 0)
  );

  const coloredText = colorSweep(snoopText, frame);

  const outputLines: string[] = [];

  const totalRows = snoopText.length + 2;

  for (let row = 0; row < totalRows; row++) {
    let textPart = '';
    if (row < snoopText.length) {
      // Slice visible chars from colored text (strip ANSI for slicing, re-apply)
      const rawLine = snoopText[row] ?? '';
      const visible = rawLine.slice(0, textVisibleChars);
      const colored = colorSweep([visible], frame)[0] ?? '';
      textPart = colored;
    } else if (row === snoopText.length + 1 && progress > 0.8) {
      textPart = chalk.gray(tagline);
    }

    outputLines.push(`  ${textPart}`);
  }

  return outputLines.join('\n');
}

function clearLines(n: number) {
  process.stdout.write(`\x1B[${n}A\x1B[0J`);
}

export async function playBanner(): Promise<void> {
  // Skip animation if not a TTY (e.g. piped output)
  if (!process.stdout.isTTY) {
    return;
  }

  const totalFrames = 40;
  const fps = 20;
  const frameMs = 1000 / fps;
  const totalRows = snoopText.length + 2;

  // Render first frame (no clear needed)
  const first = renderFrame(0, totalFrames);
  process.stdout.write(first + '\n');

  for (let f = 1; f <= totalFrames; f++) {
    await new Promise(r => setTimeout(r, frameMs));
    clearLines(totalRows);
    process.stdout.write(renderFrame(f, totalFrames) + '\n');
  }

  // Hold final frame briefly
  await new Promise(r => setTimeout(r, 400));
  process.stdout.write('\n');
}