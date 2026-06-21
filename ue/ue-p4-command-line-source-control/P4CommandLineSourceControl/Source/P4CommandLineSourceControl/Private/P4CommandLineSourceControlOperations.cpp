#include "P4CommandLineSourceControlOperations.h"

const FName FP4CommandLineCheckOut::GetName()
{
    return FName("CheckOut");
}

const FName FP4CommandLineRevert::GetName()
{
    return FName("Revert");
}

const FName FP4CommandLineAdd::GetName()
{
    return FName("Add");
}

const FName FP4CommandLineDelete::GetName()
{
    return FName("Delete");
}

const FName FP4CommandLineMove::GetName()
{
    return FName("Move");
}

const FName FP4CommandLineSync::GetName()
{
    return FName("Sync");
}

const FName FP4CommandLineUpdateStatus::GetName()
{
    return FName("UpdateStatus");
}

const FName FP4CommandLineCheckIn::GetName()
{
    return FName("CheckIn");
}

const FName FP4CommandLineHistory::GetName()
{
    return FName("History");
}

const FName FP4CommandLineAnnotate::GetName()
{
    return FName("Annotate");
}