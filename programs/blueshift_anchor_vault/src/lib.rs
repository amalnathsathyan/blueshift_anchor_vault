use anchor_lang::prelude::*;
use anchor_lang::system_program::{transfer, Transfer};

declare_id!("Dhmc6b1boQ6WSgnNojLRnLSu8atQnV3RsJWP1B1E733E");

#[program]
pub mod blueshift_anchor_vault {
    use super::*;

    pub fn deposit(ctx: Context<VaultDeposit>, amount: u64) -> Result<()> {
        require_gt!(
            amount,
            Rent::get()?.minimum_balance(0),
            VaultError::InvalidAmount
        );
        transfer(
            CpiContext::new(
                ctx.accounts.system_program.to_account_info(),
                Transfer {
                    from: ctx.accounts.signer.to_account_info(),
                    to: ctx.accounts.vault.to_account_info(),
                },
            ),
            amount,
        )?;
        Ok(())
    }

    pub fn withdraw(ctx: Context<VaultWithdraw>) -> Result<()> {
        require_neq!(
            ctx.accounts.vault.get_lamports(),
            0,
            VaultError::InvalidAmount
        );
        
        Ok(())
    }
}

#[derive(Accounts)]
pub struct VaultDeposit<'info> {
    #[account(mut)]
    pub signer: Signer<'info>,
    #[account(
        init,
        seeds = [b"anchor_vault", signer.key().as_ref(), extra_seed.key().as_ref()],
        bump,
        payer = signer,
        space = 8,
    )]
    pub vault: Account<'info, Vault>,
    /// CHECK: This can be any pubkey or bytes passed as seed
    pub extra_seed: UncheckedAccount<'info>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct VaultWithdraw<'info> {
    #[account(mut)]
    pub signer: Signer<'info>,
    #[account(
        mut,
        seeds = [b"anchor_vault", signer.key().as_ref(), extra_seed.key().as_ref()],
        bump,
        close = signer // <-- This closes the account after withdraw
    )]
    pub vault: Account<'info, Vault>,
    /// CHECK: This can be any pubkey or bytes passed as seed
    pub extra_seed: UncheckedAccount<'info>,
    pub system_program: Program<'info, System>,
}

#[account]
pub struct Vault {}


#[error_code]
pub enum VaultError {
    #[msg("Vault Already Exists")]
    VaultAlreadyExists,
    #[msg("Invalid Amount")]
    InvalidAmount,
}
