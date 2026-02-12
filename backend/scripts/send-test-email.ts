import { emailService } from '../src/services/email';

const args = process.argv.slice(2);
const toArg = args.find(arg => arg.startsWith('--to='));
const to = toArg ? toArg.split('=')[1] : process.env.TEST_EMAIL_TO;

if (!to) {
    console.error('Missing recipient. Use --to=email@example.com or set TEST_EMAIL_TO.');
    process.exit(1);
}

(async () => {
    const ok = await emailService.send({
        to,
        subject: 'NexVote test email',
        html: '<p>This is a test email from NexVote.</p>',
    });

    if (!ok) {
        console.error('Test email failed to send. Check SMTP settings.');
        process.exit(1);
    }

    console.log('Test email sent successfully.');
    process.exit(0);
})();
