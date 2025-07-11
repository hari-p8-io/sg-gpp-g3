const { Spanner } = require('@google-cloud/spanner');
const config = require('../config/default');

async function setupDatabase() {
  // Initialize Spanner client
  const spanner = new Spanner({
    projectId: config.spanner.projectId,
    apiEndpoint: config.spanner.emulatorHost
  });

  const instance = spanner.instance(config.spanner.instanceId);
  const database = instance.database(config.spanner.databaseId);

  try {
    console.log('🔄 Setting up Cloud Spanner database...');
    
    // Create instance if it doesn't exist
    try {
      await instance.get();
      console.log('✅ Spanner instance already exists');
    } catch (error) {
      console.log('🔄 Creating Spanner instance...');
      await instance.create({
        config: 'regional-us-central1',
        nodes: 1,
        displayName: 'GPP G3 Singapore Test Instance'
      });
      console.log('✅ Spanner instance created');
    }

    // Create database if it doesn't exist
    try {
      await database.get();
      console.log('✅ Database already exists');
    } catch (error) {
      console.log('🔄 Creating database...');
      await database.create();
      console.log('✅ Database created');
    }

    // Create safe_str table
    console.log('🔄 Creating safe_str table...');
    const createTableQuery = `
      CREATE TABLE safe_str (
        message_id STRING(36) NOT NULL,
        puid STRING(16) NOT NULL,
        message_type STRING(10) NOT NULL,
        payload STRING(MAX) NOT NULL,
        created_at TIMESTAMP NOT NULL OPTIONS (allow_commit_timestamp=true),
        processed_at TIMESTAMP,
        status STRING(20) NOT NULL,
      ) PRIMARY KEY (message_id)
    `;

    await database.updateSchema([createTableQuery]);
    console.log('✅ safe_str table created');

    // Create indexes
    console.log('🔄 Creating indexes...');
    const indexes = [
      'CREATE UNIQUE INDEX idx_puid ON safe_str (puid)',
      'CREATE INDEX idx_message_type_created_at ON safe_str (message_type, created_at)',
      'CREATE INDEX idx_status_created_at ON safe_str (status, created_at)'
    ];

    await database.updateSchema(indexes);
    console.log('✅ Indexes created');

    console.log('🎉 Database setup completed successfully!');
    process.exit(0);
  } catch (error) {
    console.error('❌ Database setup failed:', error);
    process.exit(1);
  }
}

setupDatabase(); 