#pragma once

#include "CoreMinimal.h"
#include "ISourceControlRevision.h"

class FP4CommandLineSourceControlRevision : public ISourceControlRevision
{
public:
    virtual bool Get(FString& InOutFilename, EConcurrency::Type InConcurrency = EConcurrency::Synchronous) const override;
    virtual bool GetAnnotated(TArray<FAnnotationLine>& OutLines) const override;
    virtual bool GetAnnotated(FString& InOutFilename) const override;
    virtual const FString& GetFilename() const override;
    virtual int32 GetRevisionNumber() const override;
    virtual const FString& GetRevision() const override;
    virtual const FString& GetDescription() const override;
    virtual const FString& GetUserName() const override;
    virtual const FString& GetClientSpec() const override;
    virtual const FString& GetAction() const override;
    virtual const FDateTime& GetDate() const override;
    virtual int32 GetCheckInIdentifier() const override;
    virtual int32 GetFileSize() const override;
    virtual const FString& GetBranchName() const override;
    virtual const FString& GetCommitId() const override;
    virtual bool IsCurrent() const override;

    void Update(const FString& InFilename, int32 InRevision, const FString& InDescription, const FString& InUserName, const FDateTime& InDate, const FString& InAction, int32 InChangeList);

private:
    FString Filename;
    int32 RevisionNumber = 0;
    FString Revision;
    FString Description;
    FString UserName;
    FString ClientSpec;
    FString Action;
    FDateTime Date;
    int32 ChangeList = 0;
    int32 FileSize = 0;
    FString BranchName;
    FString CommitId;
};
