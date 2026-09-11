import fs from 'fs';
import { randomUUID } from 'crypto';

const CREATOR_ID = '407def3e-712d-42d4-9c6d-56ed7a240836';

interface NewQuiz {
  topic: string;
  difficulty: 'beginner' | 'intermediate' | 'advanced';
  total_questions: number;
  questions: Array<{
    prompt: string;
    options: Array<{ id: string; text: string }>;
    correct_answer: string;
    hint: string;
    explanation: string;
  }>;
}

const DIVERSE_QUIZZES: NewQuiz[] = [
  {
    topic: 'Classical Mechanics: Newton’s Laws & Energy',
    difficulty: 'intermediate',
    total_questions: 5,
    questions: [
      {
        prompt: 'A block of mass $m = 4\\text{ kg}$ is pulled along a frictionless horizontal surface by a force $F = 20\\text{ N}$ at an angle of $60^\\circ$ above the horizontal. What is the horizontal acceleration of the block?',
        options: [
          { id: 'A', text: '$2.5\\text{ m/s}^2$' },
          { id: 'B', text: '$5.0\\text{ m/s}^2$' },
          { id: 'C', text: '$4.33\\text{ m/s}^2$' },
          { id: 'D', text: '$1.25\\text{ m/s}^2$' },
        ],
        correct_answer: 'A',
        hint: 'Decompose the pulling force into horizontal and vertical vector components using trigonometric cosines.',
        explanation: 'The horizontal force component accelerating the mass is $F_x = F \\cos(60^\\circ) = 20 \\times 0.5 = 10\\text{ N}$. By Newton\'s second law, $a = \\frac{F_x}{m} = \\frac{10}{4} = 2.5\\text{ m/s}^2$.',
      },
      {
        prompt: 'A particle moves with kinetic energy $K$. If its linear momentum $p$ is doubled while its mass remains constant, what is its new kinetic energy?',
        options: [
          { id: 'A', text: '$2K$' },
          { id: 'B', text: '$4K$' },
          { id: 'C', text: '$\\frac{1}{2}K$' },
          { id: 'D', text: '$8K$' },
        ],
        correct_answer: 'B',
        hint: 'Recall the relationship between momentum $p = mv$ and kinetic energy $K = \\frac{1}{2}mv^2$.',
        explanation: 'Since $K = \\frac{p^2}{2m}$, kinetic energy scales quadratically with linear momentum. Doubling momentum produces $(2p)^2 = 4p^2$, resulting in $4K$.',
      },
      {
        prompt: 'A projectile is launched from the ground with speed $v_0 = 30\\text{ m/s}$ at an angle of $30^\\circ$ above the horizontal. Neglecting air resistance and using $g = 10\\text{ m/s}^2$, what is its maximum height $H$?',
        options: [
          { id: 'A', text: '$11.25\\text{ m}$' },
          { id: 'B', text: '$22.5\\text{ m}$' },
          { id: 'C', text: '$45.0\\text{ m}$' },
          { id: 'D', text: '$15.0\\text{ m}$' },
        ],
        correct_answer: 'A',
        hint: 'Maximum height depends exclusively on the initial vertical component of velocity $v_{0y} = v_0 \\sin(\\theta)$.',
        explanation: 'Initial vertical velocity is $v_{0y} = 30 \\sin(30^\\circ) = 15\\text{ m/s}$. Using $v_y^2 = v_{0y}^2 - 2gH = 0$, we find $H = \\frac{15^2}{2 \\times 10} = \\frac{225}{20} = 11.25\\text{ m}$.',
      },
      {
        prompt: 'Two carts on a frictionless track collide. Cart A ($m_A = 2\\text{ kg}$) moves at $3\\text{ m/s}$ toward Cart B ($m_B = 1\\text{ kg}$), which is at rest. After a completely inelastic collision, what is their final common velocity?',
        options: [
          { id: 'A', text: '$1.0\\text{ m/s}$' },
          { id: 'B', text: '$1.5\\text{ m/s}$' },
          { id: 'C', text: '$2.0\\text{ m/s}$' },
          { id: 'D', text: '$3.0\\text{ m/s}$' },
        ],
        correct_answer: 'C',
        hint: 'Completely inelastic collisions stick together, conserving total linear momentum.',
        explanation: 'Conservation of momentum: $p_{\\text{initial}} = m_A v_A = 2 \\times 3 = 6\\text{ kg}\\cdot\\text{m/s}$. Combined mass is $2 + 1 = 3\\text{ kg}$. Final velocity $v_f = \\frac{6}{3} = 2.0\\text{ m/s}$.',
      },
      {
        prompt: 'A spring with spring constant $k = 200\\text{ N/m}$ is compressed by $0.1\\text{ m}$ from its equilibrium position. What is the elastic potential energy stored in the spring?',
        options: [
          { id: 'A', text: '$1.0\\text{ J}$' },
          { id: 'B', text: '$2.0\\text{ J}$' },
          { id: 'C', text: '$20.0\\text{ J}$' },
          { id: 'D', text: '$0.5\\text{ J}$' },
        ],
        correct_answer: 'A',
        hint: 'Apply Hooke\'s potential energy formula $U = \\frac{1}{2}kx^2$.',
        explanation: 'Elastic potential energy is $U = \\frac{1}{2} k x^2 = \\frac{1}{2} \\times 200 \\times (0.1)^2 = 100 \\times 0.01 = 1.0\\text{ J}$.',
      },
    ],
  },
  {
    topic: 'Electromagnetism & Circuit Theory',
    difficulty: 'advanced',
    total_questions: 5,
    questions: [
      {
        prompt: 'An ideal RC series circuit consists of a resistor $R = 50\\text{ k}\\Omega$ and a capacitor $C = 20\\,\\mu\\text{F}$ connected to a DC source. What is the time constant $\\tau$ of the circuit?',
        options: [
          { id: 'A', text: '$0.1\\text{ s}$' },
          { id: 'B', text: '$1.0\\text{ s}$' },
          { id: 'C', text: '$10.0\\text{ s}$' },
          { id: 'D', text: '$0.01\\text{ s}$' },
        ],
        correct_answer: 'B',
        hint: 'The charging rate of an RC circuit is governed by the product $\\tau = RC$.',
        explanation: 'Time constant $\\tau = RC = (50 \\times 10^3\\,\\Omega) \\times (20 \\times 10^{-6}\\text{ F}) = 1.0\\text{ s}$. At $t = \\tau$, the capacitor charges to $\\approx 63.2\\%$ of $V_{\\text{source}}$.',
      },
      {
        prompt: 'According to Gauss’s Law, what is the total electric flux $\\Phi_E$ through any closed surface enclosing a net charge $q$?',
        options: [
          { id: 'A', text: '$\\frac{q}{\\epsilon_0}$' },
          { id: 'B', text: '$\\frac{q}{4\\pi\\epsilon_0 R^2}$' },
          { id: 'C', text: '$\\frac{q}{4\\pi R}$' },
          { id: 'D', text: '$0$' },
        ],
        correct_answer: 'A',
        hint: 'Gauss\'s Law relates enclosed charge to permittivity of free space $\\epsilon_0$, regardless of shape.',
        explanation: 'By Gauss\'s Law: $\\Phi_E = \\oint \\mathbf{E} \\cdot d\\mathbf{A} = \\frac{q_{\\text{enclosed}}}{\\epsilon_0}$. The flux is completely independent of the Gaussian surface radius or geometry.',
      },
      {
        prompt: 'A conducting loop of area $A = 0.05\\text{ m}^2$ is oriented perpendicular to a magnetic field that increases uniformly from $0.2\\text{ T}$ to $1.2\\text{ T}$ in $0.25\\text{ s}$. What magnitude of EMF is induced in the loop?',
        options: [
          { id: 'A', text: '$0.1\\text{ V}$' },
          { id: 'B', text: '$0.2\\text{ V}$' },
          { id: 'C', text: '$0.4\\text{ V}$' },
          { id: 'D', text: '$0.05\\text{ V}$' },
        ],
        correct_answer: 'B',
        hint: 'Apply Faraday’s Law of Electromagnetic Induction: $|\\mathcal{E}| = \\left|\\frac{d\\Phi_B}{dt}\\right|$.',
        explanation: 'The change in flux is $\\Delta \\Phi_B = A \\cdot \\Delta B = 0.05 \\times (1.2 - 0.2) = 0.05\\text{ Wb}$. By Faraday\'s Law, $|\\mathcal{E}| = \\frac{\\Delta \\Phi_B}{\\Delta t} = \\frac{0.05}{0.25} = 0.2\\text{ V}$.',
      },
      {
        prompt: 'Two identical inductors of inductance $L = 6\\text{ mH}$ each are connected in parallel without mutual coupling. What is the equivalent inductance $L_{\\text{eq}}$?',
        options: [
          { id: 'A', text: '$12\\text{ mH}$' },
          { id: 'B', text: '$3\\text{ mH}$' },
          { id: 'C', text: '$6\\text{ mH}$' },
          { id: 'D', text: '$1.5\\text{ mH}$' },
        ],
        correct_answer: 'B',
        hint: 'Inductors in parallel combine mathematically just like resistors in parallel.',
        explanation: 'For uncoupled parallel inductors, $\\frac{1}{L_{\\text{eq}}} = \\frac{1}{L_1} + \\frac{1}{L_2} = \\frac{1}{6} + \\frac{1}{6} = \\frac{1}{3}\\text{ mH}^{-1} \\implies L_{\\text{eq}} = 3\\text{ mH}$.',
      },
      {
        prompt: 'What is the phase relationship between the current and the applied voltage across an ideal inductor in an AC circuit?',
        options: [
          { id: 'A', text: 'Current leads voltage by $90^\\circ$' },
          { id: 'B', text: 'Voltage leads current by $90^\\circ$' },
          { id: 'C', text: 'Current and voltage are in phase ($0^\\circ$)' },
          { id: 'D', text: 'Voltage leads current by $180^\\circ$' },
        ],
        correct_answer: 'B',
        hint: 'Remember the mnemonic ELI: in an inductor ($L$), EMF ($E$) leads current ($I$).',
        explanation: 'In an ideal inductor, $v(t) = L \\frac{di}{dt}$. For sinusoidal current $i(t) = I_0 \\sin(\\omega t)$, the voltage is $v(t) = \\omega L I_0 \\cos(\\omega t) = V_0 \\sin(\\omega t + 90^\\circ)$. Voltage leads current by $90^\\circ$.',
      },
    ],
  },
  {
    topic: 'Organic Chemistry: Reaction Mechanisms & Stereochemistry',
    difficulty: 'intermediate',
    total_questions: 5,
    questions: [
      {
        prompt: 'Which of the following reaction conditions strongly favors an $S_N2$ substitution mechanism over an $S_N1$ mechanism?',
        options: [
          { id: 'A', text: 'Tertiary alkyl halide substrate with a weak nucleophile in a protic solvent' },
          { id: 'B', text: 'Primary alkyl halide substrate with a strong nucleophile in an aprotic solvent' },
          { id: 'C', text: 'High temperature with a bulky strong base in water' },
          { id: 'D', text: 'Secondary carbocation intermediate stabilized by resonance' },
        ],
        correct_answer: 'B',
        hint: '$S_N2$ is a concerted backside displacement, highly sensitive to steric hindrance.',
        explanation: '$S_N2$ requires unhindered substrates (primary > secondary) and strong nucleophiles. Polar aprotic solvents (like DMSO or acetone) do not cage the nucleophile, facilitating rapid attack.',
      },
      {
        prompt: 'According to Hückel’s rule, a planar, fully conjugated cyclic hydrocarbon is aromatic if its conjugated ring possesses how many $\\pi$ electrons?',
        options: [
          { id: 'A', text: '$4n$ where $n \\ge 1$' },
          { id: 'B', text: '$4n + 2$ where $n \\ge 0$' },
          { id: 'C', text: '$2n + 1$ where $n \\ge 1$' },
          { id: 'D', text: '$6n + 2$ where $n \\ge 0$' },
        ],
        correct_answer: 'B',
        hint: 'Benzene possesses 6 $\\pi$ electrons ($n=1$), conferring extraordinary aromatic stability.',
        explanation: 'Hückel\'s rule specifies that a planar cyclic conjugated ring exhibits aromatic stability when containing $4n + 2$ $\\pi$ electrons (e.g. 2, 6, 10, 14 $\\pi$ electrons).',
      },
      {
        prompt: 'In the electrophilic addition of hydrogen chloride ($\\text{HCl}$) to propene ($\\text{CH}_3\\text{-CH=CH}_2$), what is the major product predicted by Markovnikov’s rule?',
        options: [
          { id: 'A', text: '1-chloropropane' },
          { id: 'B', text: '2-chloropropane' },
          { id: 'C', text: '1,2-dichloropropane' },
          { id: 'D', text: 'Propyl alcohol' },
        ],
        correct_answer: 'B',
        hint: 'Markovnikov’s rule dictates that the proton adds to the carbon with more hydrogen atoms to yield the more stable carbocation.',
        explanation: 'Protonation of terminal C1 produces a secondary carbocation on C2, which is more stable than a primary carbocation. Chloride attacks C2, yielding 2-chloropropane.',
      },
      {
        prompt: 'What stereochemical relationship describes $(2R, 3R)$-tartaric acid and $(2S, 3S)$-tartaric acid?',
        options: [
          { id: 'A', text: 'Diastereomers' },
          { id: 'B', text: 'Enantiomers' },
          { id: 'C', text: 'Meso compounds' },
          { id: 'D', text: 'Constitutional isomers' },
        ],
        correct_answer: 'B',
        hint: 'When all chiral stereocenters in a chiral molecule are inverted to their opposite configuration, the two structures are mirror images.',
        explanation: 'Inverting both stereocenters ($(R,R) \\to (S,S)$) creates non-superimposable mirror images, defining an enantiomeric pair.',
      },
      {
        prompt: 'What is the hybridization and bond angle of the carbon atoms in ethene ($\\text{C}_2\\text{H}_4$)?',
        options: [
          { id: 'A', text: '$sp^3$, $109.5^\\circ$' },
          { id: 'B', text: '$sp^2$, $120^\\circ$' },
          { id: 'C', text: '$sp$, $180^\\circ$' },
          { id: 'D', text: '$dsp^3$, $90^\\circ$' },
        ],
        correct_answer: 'B',
        hint: 'Determine the steric number of bonded atoms surrounding each double-bonded carbon.',
        explanation: 'Each carbon forms three $\\sigma$ bonds and one $\\pi$ bond (steric number = 3). This dictates $sp^2$ trigonal planar hybridization with bond angles of $\\approx 120^\\circ$.',
      },
    ],
  },
  {
    topic: 'Linear Algebra: Vector Spaces & Eigenvalues',
    difficulty: 'advanced',
    total_questions: 5,
    questions: [
      {
        prompt: 'Given the matrix $A = \\begin{pmatrix} 4 & 1 \\\\ 2 & 3 \\end{pmatrix}$, what are its eigenvalues $\\lambda$?',
        options: [
          { id: 'A', text: '$\\lambda = 2, 5$' },
          { id: 'B', text: '$\\lambda = 1, 6$' },
          { id: 'C', text: '$\\lambda = 3, 4$' },
          { id: 'D', text: '$\\lambda = -2, -5$' },
        ],
        correct_answer: 'A',
        hint: 'Solve the characteristic equation $\\det(A - \\lambda I) = 0$.',
        explanation: '$\\det\\begin{pmatrix} 4-\\lambda & 1 \\\\ 2 & 3-\\lambda \\end{pmatrix} = (4-\\lambda)(3-\\lambda) - 2 = \\lambda^2 - 7\\lambda + 10 = 0 \\implies (\\lambda-2)(\\lambda-5)=0 \\implies \\lambda = 2, 5$.',
      },
      {
        prompt: 'For an $m \\times n$ real matrix $M$, the Rank-Nullity Theorem establishes that:',
        options: [
          { id: 'A', text: '$\\operatorname{rank}(M) + \\operatorname{nullity}(M) = m$' },
          { id: 'B', text: '$\\operatorname{rank}(M) + \\operatorname{nullity}(M) = n$' },
          { id: 'C', text: '$\\operatorname{rank}(M) - \\operatorname{nullity}(M) = n$' },
          { id: 'D', text: '$\\operatorname{rank}(M) \\times \\operatorname{nullity}(M) = m \\times n$' },
        ],
        correct_answer: 'B',
        hint: 'The domain of the linear mapping $T(\\mathbf{x}) = M\\mathbf{x}$ is $\\mathbb{R}^n$.',
        explanation: 'By the Rank-Nullity Theorem, the dimension of the domain (number of columns $n$) equals the dimension of the image (rank) plus the kernel dimension (nullity): $\\operatorname{rank}(M) + \\operatorname{nullity}(M) = n$.',
      },
      {
        prompt: 'Under what condition is a square matrix $A$ guaranteed to be invertible?',
        options: [
          { id: 'A', text: '$\\operatorname{Trace}(A) \\ne 0$' },
          { id: 'B', text: '$\\det(A) \\ne 0$ and $0$ is not an eigenvalue' },
          { id: 'C', text: 'All diagonal entries of $A$ are positive' },
          { id: 'D', text: 'The columns of $A$ are linearly dependent' },
        ],
        correct_answer: 'B',
        hint: 'A zero determinant maps the space to lower dimension, destroying invertibility.',
        explanation: 'A matrix is invertible if and only if its determinant is non-zero, meaning 0 is not an eigenvalue and its columns form a linearly independent basis.',
      },
      {
        prompt: 'What is the dot product of $\\mathbf{u} = \\begin{pmatrix} 2 \\\\ -3 \\\\ 1 \\end{pmatrix}$ and $\\mathbf{v} = \\begin{pmatrix} 4 \\\\ 1 \\\\ -2 \\end{pmatrix}$, and what does its sign indicate?',
        options: [
          { id: 'A', text: '$3$, the angle between them is acute' },
          { id: 'B', text: '$0$, the vectors are orthogonal' },
          { id: 'C', text: '$-3$, the angle between them is obtuse' },
          { id: 'D', text: '$7$, the vectors are parallel' },
        ],
        correct_answer: 'A',
        hint: 'Compute $\\mathbf{u} \\cdot \\mathbf{v} = u_1 v_1 + u_2 v_2 + u_3 v_3$.',
        explanation: '$\\mathbf{u} \\cdot \\mathbf{v} = (2)(4) + (-3)(1) + (1)(-2) = 8 - 3 - 2 = 3$. Because $\\mathbf{u} \\cdot \\mathbf{v} > 0$, $\\cos(\\theta) > 0$, indicating an acute angle ($<90^\\circ$).',
      },
      {
        prompt: 'If a real symmetric matrix $S$ has distinct eigenvalues $\\lambda_1 \\ne \\lambda_2$, what is guaranteed regarding their corresponding eigenvectors $\\mathbf{v}_1$ and $\\mathbf{v}_2$?',
        options: [
          { id: 'A', text: 'They are collinear' },
          { id: 'B', text: 'They are mutually orthogonal' },
          { id: 'C', text: 'They must have unit length' },
          { id: 'D', text: 'They belong to the null space of $S$' },
        ],
        correct_answer: 'B',
        hint: 'This fundamental property forms the core of the Spectral Theorem.',
        explanation: 'By the Spectral Theorem, eigenvectors associated with distinct eigenvalues of a real symmetric matrix are guaranteed to be orthogonal: $\\mathbf{v}_1 \\cdot \\mathbf{v}_2 = 0$.',
      },
    ],
  },
  {
    topic: 'Molecular Biology: DNA Replication & Gene Expression',
    difficulty: 'intermediate',
    total_questions: 5,
    questions: [
      {
        prompt: 'During eukaryotic DNA replication, which enzyme is responsible for unwinding the double helix at the replication fork?',
        options: [
          { id: 'A', text: 'DNA Ligase' },
          { id: 'B', text: 'DNA Helicase' },
          { id: 'C', text: 'RNA Primase' },
          { id: 'D', text: 'Topoisomerase' },
        ],
        correct_answer: 'B',
        hint: 'This enzyme uses ATP to break hydrogen bonds between complementary base pairs.',
        explanation: 'DNA Helicase disrupts hydrogen bonds between base pairs to separate the two strands. Topoisomerase relieves downstream torsional strain.',
      },
      {
        prompt: 'Which enzyme synthesizes messenger RNA (mRNA) from a DNA template during eukaryotic transcription?',
        options: [
          { id: 'A', text: 'DNA Polymerase III' },
          { id: 'B', text: 'RNA Polymerase II' },
          { id: 'C', text: 'Reverse Transcriptase' },
          { id: 'D', text: 'Ribosome' },
        ],
        correct_answer: 'B',
        hint: 'In eukaryotes, RNA Polymerase II specifically transcribes protein-coding messenger RNAs.',
        explanation: 'RNA Polymerase II is the primary eukaryotic enzyme that synthesizes precursor mRNA from DNA templates in the nucleus.',
      },
      {
        prompt: 'In the universal genetic code, which nucleotide triplet serves as the start codon initiating translation and encoding methionine?',
        options: [
          { id: 'A', text: 'UAA' },
          { id: 'B', text: 'AUG' },
          { id: 'C', text: 'UGA' },
          { id: 'D', text: 'UAG' },
        ],
        correct_answer: 'B',
        hint: 'The initiator tRNA recognizes this triplet in the ribosomal P-site.',
        explanation: 'AUG is the universal start codon that initiates translation and specifies the amino acid methionine. UAA, UGA, and UAG are stop codons.',
      },
      {
        prompt: 'What is the primary function of guide RNA (gRNA) in the CRISPR-Cas9 genome editing complex?',
        options: [
          { id: 'A', text: 'To cleave the target DNA backbone' },
          { id: 'B', text: 'To direct Cas9 to a complementary target sequence' },
          { id: 'C', text: 'To repair double-strand breaks via homologous recombination' },
          { id: 'D', text: 'To methylate histone proteins' },
        ],
        correct_answer: 'B',
        hint: 'The guide RNA has a ~20 nucleotide sequence matching the genomic target site.',
        explanation: 'Guide RNA hybridizes via complementary base pairing to the target DNA locus, directing the Cas9 endonuclease to introduce a precise double-strand break.',
      },
      {
        prompt: 'In eukaryotic cellular respiration, which process generates the vast majority of ATP via oxidative phosphorylation?',
        options: [
          { id: 'A', text: 'Glycolysis' },
          { id: 'B', text: 'Electron Transport Chain & ATP Synthase' },
          { id: 'C', text: 'The Citric Acid (Krebs) Cycle' },
          { id: 'D', text: 'Lactic acid fermentation' },
        ],
        correct_answer: 'B',
        hint: 'This process harnesses the proton motive force across the inner mitochondrial membrane.',
        explanation: 'Chemiosmosis via the Electron Transport Chain and ATP Synthase generates approximately 26–28 of the ~30–32 ATP molecules produced per glucose molecule.',
      },
    ],
  },
];

function escapeSql(str: string): string {
  return str.replace(/'/g, "''");
}

let sql = '-- Diverse Academic Quizzes Seed Script\n\n';

for (const q of DIVERSE_QUIZZES) {
  const quizId = randomUUID();
  sql += `INSERT INTO quizzes (id, topic, difficulty, total_questions, created_by, created_at)\n`;
  sql += `VALUES ('${quizId}', '${escapeSql(q.topic)}', '${q.difficulty}', ${q.total_questions}, '${CREATOR_ID}', NOW());\n\n`;

  for (let i = 0; i < q.questions.length; i++) {
    const qItem = q.questions[i];
    const qId = randomUUID();
    const optionsJson = JSON.stringify(qItem.options);

    sql += `INSERT INTO questions (id, quiz_id, prompt, options, correct_answer, hint, explanation, order_index, created_at)\n`;
    sql += `VALUES ('${qId}', '${quizId}', '${escapeSql(qItem.prompt)}', '${escapeSql(optionsJson)}'::jsonb, '${qItem.correct_answer}', '${escapeSql(qItem.hint)}', '${escapeSql(qItem.explanation)}', ${i + 1}, NOW());\n\n`;
  }
}

fs.writeFileSync('scripts/generated_seed.sql', sql);
console.log('Generated SQL file: scripts/generated_seed.sql');
