const axios = require('axios');

// Colors for console output
const colors = {
    reset: '\x1b[0m',
    bright: '\x1b[1m',
    red: '\x1b[31m',
    green: '\x1b[32m',
    yellow: '\x1b[33m',
    blue: '\x1b[34m',
    magenta: '\x1b[35m',
    cyan: '\x1b[36m'
};

class FlowVerificationTest {
    constructor() {
        this.services = {
            orchestrator: 'http://localhost:3004',
            vamMediation: 'http://localhost:3005',
            accounting: 'http://localhost:8002'
        };
    }

    log(message, color = colors.cyan) {
        console.log(`${color}${message}${colors.reset}`);
    }

    async checkServiceHealth() {
        this.log('🔍 Checking service health...', colors.blue);
        
        for (const [serviceName, url] of Object.entries(this.services)) {
            try {
                const response = await axios.get(`${url}/health`, { timeout: 5000 });
                this.log(`✅ ${serviceName}: healthy`, colors.green);
            } catch (error) {
                this.log(`❌ ${serviceName}: unhealthy`, colors.red);
                return false;
            }
        }
        
        return true;
    }

    async verifyVAMFlow() {
        this.log('\n🏦 Verifying VAM Flow...', colors.blue);
        
        try {
            // Check VAM mediation service
            const vamResponse = await axios.get(`${this.services.vamMediation}/api/v1/messages`);
            const vamMessages = vamResponse.data.messages || [];
            
            const vamAccountMessages = vamMessages.filter(msg => 
                msg.originalMessage.enrichmentData.physicalAcctInfo.acctSys === 'VAM'
            );
            
            this.log(`📥 VAM Mediation Service processed ${vamAccountMessages.length} VAM messages`);
            
            if (vamAccountMessages.length > 0) {
                for (const msg of vamAccountMessages.slice(-2)) { // Show last 2
                    this.log(`   • Account: ${msg.originalMessage.enrichmentData.physicalAcctInfo.acctId}`);
                    this.log(`   • Status: ${msg.processing.status}`);
                    this.log(`   • VAM Services: ${Object.entries(msg.processing.vamServices).map(([k,v]) => `${k}:${v}`).join(', ')}`);
                }
            }

            // Check accounting service for VAM transactions
            const accountingResponse = await axios.get(`${this.services.accounting}/api/v1/accounting/transactions`);
            const transactions = accountingResponse.data.transactions || [];
            
            const vamTransactions = transactions.filter(tx => 
                tx.metadata.enrichmentData.physicalAcctInfo && 
                tx.metadata.enrichmentData.physicalAcctInfo.acctSys === 'VAM'
            );
            
            this.log(`💰 Accounting Service processed ${vamTransactions.length} VAM transactions`);
            
            if (vamTransactions.length > 0) {
                for (const tx of vamTransactions.slice(-2)) { // Show last 2
                    this.log(`   • Transaction ID: ${tx.transactionId}`);
                    this.log(`   • Account: ${tx.metadata.enrichmentData.physicalAcctInfo.acctId}`);
                    this.log(`   • Status: ${tx.processing.status}`);
                    this.log(`   • Source: ${tx.metadata.sourceService}`);
                }
            }

            const vamFlowWorking = vamAccountMessages.length > 0 && vamTransactions.length > 0;
            
            if (vamFlowWorking) {
                this.log('✅ VAM Flow: WORKING', colors.green);
                this.log('   ✓ Messages processed by VAM mediation service');
                this.log('   ✓ Transactions processed by accounting service');
            } else {
                this.log('❌ VAM Flow: NOT WORKING', colors.red);
            }
            
            return vamFlowWorking;
            
        } catch (error) {
            this.log(`❌ Error verifying VAM flow: ${error.message}`, colors.red);
            return false;
        }
    }

    async verifyMDZFlow() {
        this.log('\n🏛️ Verifying MDZ Flow...', colors.blue);
        
        try {
            // Check accounting service for MDZ transactions (should bypass VAM mediation)
            const accountingResponse = await axios.get(`${this.services.accounting}/api/v1/accounting/transactions`);
            const transactions = accountingResponse.data.transactions || [];
            
            const mdzTransactions = transactions.filter(tx => 
                tx.metadata.enrichmentData.physicalAcctInfo && 
                tx.metadata.enrichmentData.physicalAcctInfo.acctSys === 'MDZ'
            );
            
            this.log(`💰 Accounting Service processed ${mdzTransactions.length} MDZ transactions`);
            
            if (mdzTransactions.length > 0) {
                for (const tx of mdzTransactions.slice(-2)) { // Show last 2
                    this.log(`   • Transaction ID: ${tx.transactionId}`);
                    this.log(`   • Account: ${tx.metadata.enrichmentData.physicalAcctInfo.acctId}`);
                    this.log(`   • Status: ${tx.processing.status}`);
                    this.log(`   • Source: ${tx.metadata.sourceService}`);
                }
            }

            // Check VAM mediation service to confirm MDZ messages did NOT go through VAM
            const vamResponse = await axios.get(`${this.services.vamMediation}/api/v1/messages`);
            const vamMessages = vamResponse.data.messages || [];
            
            const mdzInVam = vamMessages.filter(msg => 
                msg.originalMessage.enrichmentData.physicalAcctInfo.acctSys === 'MDZ'
            );
            
            this.log(`🏦 VAM Mediation Service processed ${mdzInVam.length} MDZ messages (should be 0)`);

            const mdzFlowWorking = mdzTransactions.length > 0 && mdzInVam.length === 0;
            
            if (mdzFlowWorking) {
                this.log('✅ MDZ Flow: WORKING', colors.green);
                this.log('   ✓ Transactions processed by accounting service');
                this.log('   ✓ Messages correctly bypassed VAM mediation');
            } else {
                this.log('❌ MDZ Flow: NOT WORKING', colors.red);
                if (mdzTransactions.length === 0) {
                    this.log('   ✗ No MDZ transactions found in accounting service');
                }
                if (mdzInVam.length > 0) {
                    this.log('   ✗ MDZ messages incorrectly went through VAM mediation');
                }
            }
            
            return mdzFlowWorking;
            
        } catch (error) {
            this.log(`❌ Error verifying MDZ flow: ${error.message}`, colors.red);
            return false;
        }
    }

    async verifyOrchestrator() {
        this.log('\n🔄 Verifying Orchestrator...', colors.blue);
        
        try {
            const response = await axios.get(`${this.services.orchestrator}/api/v1/messages`);
            const messages = response.data.messages || response.data || [];
            
            this.log(`📊 Orchestrator has processed ${messages.length} messages`);
            
            if (messages.length > 0) {
                const recentMessages = messages.slice(-5); // Show last 5
                for (const msg of recentMessages) {
                    this.log(`   • Message: ${msg.messageId || msg.message_id || 'unknown'}`);
                    this.log(`   • Status: ${msg.status || 'processed'}`);
                }
            }
            
            return messages.length > 0;
            
        } catch (error) {
            this.log(`❌ Error verifying orchestrator: ${error.message}`, colors.red);
            return false;
        }
    }

    async generateReport(vamWorking, mdzWorking, orchestratorWorking) {
        console.log('\n' + '='.repeat(80));
        console.log(`${colors.bright}📋 FLOW VERIFICATION REPORT${colors.reset}`);
        console.log('='.repeat(80));
        
        console.log(`\n${colors.cyan}🎯 Test Results:${colors.reset}`);
        
        const vamStatus = vamWorking ? `${colors.green}✅ WORKING${colors.reset}` : `${colors.red}❌ FAILED${colors.reset}`;
        const mdzStatus = mdzWorking ? `${colors.green}✅ WORKING${colors.reset}` : `${colors.red}❌ FAILED${colors.reset}`;
        const orchestratorStatus = orchestratorWorking ? `${colors.green}✅ WORKING${colors.reset}` : `${colors.red}❌ FAILED${colors.reset}`;
        
        console.log(`  VAM Flow:        ${vamStatus}`);
        console.log(`  MDZ Flow:        ${mdzStatus}`);
        console.log(`  Orchestrator:    ${orchestratorStatus}`);
        
        console.log(`\n${colors.cyan}🔄 Flow Details:${colors.reset}`);
        console.log('  VAM Flow: validated-messages → orchestrator → vam-messages → accounting');
        console.log('  MDZ Flow: validated-messages → orchestrator → accounting (direct)');
        
        const allWorking = vamWorking && mdzWorking && orchestratorWorking;
        const status = allWorking ? `${colors.green}ALL FLOWS WORKING${colors.reset}` : `${colors.red}SOME FLOWS HAVE ISSUES${colors.reset}`;
        
        console.log(`\n${colors.bright}📊 Overall Status: ${status}${colors.reset}`);
        console.log('='.repeat(80));
        
        return allWorking;
    }

    async run() {
        this.log('🚀 Starting Flow Verification Test', colors.bright);
        this.log('=====================================');
        
        try {
            const servicesHealthy = await this.checkServiceHealth();
            if (!servicesHealthy) {
                this.log('❌ Some services are unhealthy', colors.red);
                return false;
            }
            
            const orchestratorWorking = await this.verifyOrchestrator();
            const vamWorking = await this.verifyVAMFlow();
            const mdzWorking = await this.verifyMDZFlow();
            
            return await this.generateReport(vamWorking, mdzWorking, orchestratorWorking);
            
        } catch (error) {
            this.log(`❌ Test failed: ${error.message}`, colors.red);
            return false;
        }
    }
}

// Main execution
async function main() {
    const test = new FlowVerificationTest();
    const success = await test.run();
    
    process.exit(success ? 0 : 1);
}

if (require.main === module) {
    main().catch(console.error);
}

module.exports = FlowVerificationTest; 