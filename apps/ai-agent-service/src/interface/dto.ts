import { ArrayNotEmpty, IsArray, IsString, Length, MaxLength } from 'class-validator';

export class AskDto {
  @IsString()
  @Length(1, 2000)
  question!: string;
}

export class IngestDto {
  @IsString()
  @Length(1, 128)
  docId!: string;

  @IsString()
  @Length(1, 256)
  source!: string;

  @IsArray()
  @ArrayNotEmpty()
  @IsString({ each: true })
  roleScope!: string[];

  @IsString()
  @MaxLength(200000)
  text!: string;
}
