/**
 * Seed: demo data for development and testing.
 */
const crypto = require('crypto');
const bcrypt = require('bcryptjs');

exports.seed = async function (knex) {
    // Truncate all tables in reverse dependency order
    await knex.raw('TRUNCATE TABLE otp_tokens, audit_log, donations, admin_actions, comments, votes, proposal_metadata, proposals, community_members, communities, verifications, users CASCADE');

    // ── Demo users ──
    const passwordHash = await bcrypt.hash('DemoPass123!', 12);

    const [adminUser] = await knex('users').insert({
        email: 'admin@nexvote.dev',
        display_name: 'Region Admin',
        password_hash: passwordHash,
        region_code: 'IN-KA-BLR',
        signup_verified: true,
        role: 'admin',
    }).returning('*');

    const [demoUser] = await knex('users').insert({
        email: 'user@nexvote.dev',
        display_name: 'Demo Citizen',
        password_hash: passwordHash,
        region_code: 'IN-KA-BLR',
        signup_verified: true,
        role: 'user',
    }).returning('*');

    const [modUser] = await knex('users').insert({
        email: 'mod@nexvote.dev',
        display_name: 'Community Mod',
        password_hash: passwordHash,
        region_code: 'IN-KA-BLR',
        signup_verified: true,
        role: 'moderator',
    }).returning('*');

    // ── Verification records (simulated) ──
    await knex('verifications').insert([
        {
            user_id: adminUser.id,
            method: 'manual',
            status: 'verified',
            proof_hash: crypto.createHash('sha256').update('admin-proof-sim').digest('hex'),
            notes: 'Simulated / prototype only -- manual admin verification.',
            verified_at: new Date(),
        },
        {
            user_id: demoUser.id,
            method: 'email_otp',
            status: 'verified',
            proof_hash: crypto.createHash('sha256').update('user-proof-sim').digest('hex'),
            notes: 'Simulated / prototype only -- email OTP verification.',
            verified_at: new Date(),
        },
    ]);

    // ── Demo community ──
    const [community] = await knex('communities').insert({
        slug: 'blr-civic',
        name: 'Bangalore Civic Forum',
        description: 'Community forum for civic proposals in Bangalore metropolitan area.',
        owner_user_id: adminUser.id,
        region_code: 'IN-KA-BLR',
        category: 'civic',
        verified: true,
    }).returning('*');

    // ── Community members ──
    await knex('community_members').insert([
        { community_id: community.id, user_id: adminUser.id, role: 'owner' },
        { community_id: community.id, user_id: demoUser.id, role: 'member' },
        { community_id: community.id, user_id: modUser.id, role: 'moderator' },
    ]);

    // ── Demo proposals ──
    const deadline = new Date();
    deadline.setDate(deadline.getDate() + 7);

    const proposalHash = crypto.createHash('sha256').update('demo-proposal-1').digest('hex');

    const [proposal] = await knex('proposals').insert({
        community_id: community.id,
        title: 'Install streetlights on 5th Cross, Indiranagar',
        text: 'Multiple residents have reported safety concerns due to inadequate lighting on 5th Cross Road, Indiranagar. This proposal requests installation of 12 LED streetlights along the 800m stretch between 12th Main and 100 Feet Road.',
        category: 'infrastructure',
        status: 'voting',
        deadline: deadline,
        summary: 'Request to install 12 LED streetlights on the 800m stretch of 5th Cross, Indiranagar to address resident safety concerns.',
        proposal_hash: '0x' + proposalHash,
        created_by: demoUser.id,
        region_code: 'IN-KA-BLR',
        yes_count: 14,
        no_count: 3,
        abstain_count: 1,
    }).returning('*');

    // ── Demo votes ──
    await knex('votes').insert([
        { proposal_id: proposal.id, user_id: demoUser.id, choice: 'yes' },
        { proposal_id: proposal.id, user_id: modUser.id, choice: 'yes' },
    ]);

    // ── Demo comment ──
    await knex('comments').insert({
        proposal_id: proposal.id,
        user_id: demoUser.id,
        body: 'This stretch is especially dark around 7 PM. Streetlights would significantly improve pedestrian safety.',
    });

    // ── Audit log entry ──
    await knex('audit_log').insert({
        event_type: 'proposal_created',
        reference_id: proposal.id,
        reference_table: 'proposals',
        actor_id: demoUser.id,
        hash_onchain: '0x' + proposalHash,
        details: { source: 'seed', note: 'Demo seed data for development.' },
    });

    console.log('Seed complete: admin, user, mod, community, proposal, votes, comment, audit_log.');
};
