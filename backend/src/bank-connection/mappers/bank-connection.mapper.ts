import { BankConnection, BankAccount } from '@prisma/client';
import {
  BankConnectionResponseDto,
  BankAccountDto,
} from '../dto/bank-connection-response.dto';

type BankConnectionWithAccounts = BankConnection & {
  accounts: BankAccount[];
};

export class BankConnectionMapper {
  static toResponseDto(
    connection: BankConnectionWithAccounts,
  ): BankConnectionResponseDto {
    return {
      id: connection.id,
      institutionId: connection.institutionId,
      institutionName: connection.institutionName,
      status: connection.status,
      lastSyncedAt: connection.lastSyncedAt,
      lastSyncStatus: connection.lastSyncStatus,
      createdAt: connection.createdAt,
      accounts: connection.accounts.map((account) =>
        this.toBankAccountDto(account),
      ),
    };
  }

  static toBankAccountDto(account: BankAccount): BankAccountDto {
    return {
      id: account.id,
      plaidAccountId: account.plaidAccountId,
      name: account.name,
      officialName: account.officialName,
      type: account.type,
      subtype: account.subtype,
      mask: account.mask,
      currentBalance: account.currentBalance,
      availableBalance: account.availableBalance,
      isoCurrencyCode: account.isoCurrencyCode,
    };
  }

  static toResponseDtoList(
    connections: BankConnectionWithAccounts[],
  ): BankConnectionResponseDto[] {
    return connections.map((connection) => this.toResponseDto(connection));
  }
}
